-- ============================================================
-- MÓDULO 4: MULTI-TIENDA Y TRASLADOS DE INVENTARIO
-- Requiere: schema.sql, bootstrap_functions.sql y pos_backend.sql ya
-- aplicados (usa auth_tenant_id() y las tablas stock_transfers /
-- stock_transfer_items / inventory_stock / stock_movements definidas en
-- schema.sql).
--
-- Contenido:
--   1. create_inventory_transfer   (atómica) — despacha stock de origen a
--      destino y deja el traslado en tránsito
--   2. receive_inventory_transfer  (atómica) — confirma recepción en destino
--      y suma el inventario (soporta recepción parcial)
--   3. cancel_inventory_transfer   (atómica) — revierte un traslado que aún
--      no fue recibido, devolviendo el stock a la tienda de origen
--   4. RLS de stock_transfers / stock_transfer_items (quedaron sin política
--      en schema.sql)
-- ============================================================

-- ============================================================
-- 1. DESPACHO ATÓMICO DE TRASLADO (origen -> en tránsito)
-- ============================================================
-- p_items: [{ "product_id": uuid, "quantity": number }, ...]
--
-- Descuenta el stock de la tienda origen en la misma transacción en la que
-- crea el traslado — igual que process_sale, usa SELECT ... FOR UPDATE para
-- evitar que dos traslados/ventas simultáneos sobregiren el mismo producto.
-- El traslado nace directamente en estado 'in_transit' (el "pendiente" de
-- por aprobar no aplica aquí: el stock ya salió físicamente del origen en
-- cuanto se despacha).

create or replace function create_inventory_transfer(
    p_origin_store_id uuid,
    p_destination_store_id uuid,
    p_items jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_tenant_id uuid := auth_tenant_id();
    v_transfer_id uuid;
    v_item jsonb;
    v_product_id uuid;
    v_quantity numeric;
    v_current_stock numeric;
begin
    if v_tenant_id is null then
        raise exception 'Usuario sin negocio asociado';
    end if;

    if jsonb_array_length(p_items) = 0 then
        raise exception 'El traslado no tiene productos';
    end if;

    if p_origin_store_id = p_destination_store_id then
        raise exception 'La tienda de origen y destino no pueden ser la misma';
    end if;

    if not exists (
        select 1 from stores where id = p_origin_store_id and tenant_id = v_tenant_id
    ) then
        raise exception 'Tienda de origen inválida para este negocio';
    end if;

    if not exists (
        select 1 from stores where id = p_destination_store_id and tenant_id = v_tenant_id
    ) then
        raise exception 'Tienda de destino inválida para este negocio';
    end if;

    -- --- Paso 1: crear el encabezado del traslado ---
    insert into stock_transfers (
        tenant_id, origin_store_id, destination_store_id, status,
        requested_by, dispatched_by, dispatched_at
    )
    values (
        v_tenant_id, p_origin_store_id, p_destination_store_id, 'in_transit',
        auth.uid(), auth.uid(), now()
    )
    returning id into v_transfer_id;

    -- --- Paso 2: recorrer líneas, bloquear y descontar stock del origen ---
    for v_item in select * from jsonb_array_elements(p_items)
    loop
        v_product_id := (v_item ->> 'product_id')::uuid;
        v_quantity := (v_item ->> 'quantity')::numeric;

        if v_quantity <= 0 then
            raise exception 'Cantidad inválida en la línea de producto %', v_product_id;
        end if;

        if not exists (select 1 from products where id = v_product_id and tenant_id = v_tenant_id) then
            raise exception 'El producto % no pertenece a este negocio', v_product_id;
        end if;

        -- SELECT ... FOR UPDATE: mismo patrón anti-sobreventa que process_sale.
        select quantity into v_current_stock
          from inventory_stock
         where product_id = v_product_id and store_id = p_origin_store_id
         for update;

        if not found or v_current_stock < v_quantity then
            raise exception 'Stock insuficiente en la tienda de origen para el producto % (disponible: %)',
                v_product_id, coalesce(v_current_stock, 0);
        end if;

        update inventory_stock
           set quantity = quantity - v_quantity, updated_at = now()
         where product_id = v_product_id and store_id = p_origin_store_id;

        insert into stock_transfer_items (transfer_id, product_id, quantity_requested)
        values (v_transfer_id, v_product_id, v_quantity);

        insert into stock_movements (
            tenant_id, product_id, store_id, movement_type, quantity, reference_id, performed_by
        )
        values (v_tenant_id, v_product_id, p_origin_store_id, 'transfer_out', -v_quantity, v_transfer_id, auth.uid());
    end loop;

    return v_transfer_id;
end;
$$;

grant execute on function create_inventory_transfer(uuid, uuid, jsonb) to authenticated;

-- ============================================================
-- 2. RECEPCIÓN ATÓMICA DE TRASLADO (en tránsito -> recibido)
-- ============================================================
-- p_items (opcional): [{ "item_id": uuid, "quantity_received": number }, ...]
-- Permite recepción parcial/con diferencias (ej. rotura en el camino). Si se
-- omite, se recibe exactamente la cantidad que se despachó en cada línea.

create or replace function receive_inventory_transfer(
    p_transfer_id uuid,
    p_items jsonb default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_tenant_id uuid := auth_tenant_id();
    v_destination_store_id uuid;
    v_item record;
    v_item_override numeric;
    v_quantity_received numeric;
begin
    if v_tenant_id is null then
        raise exception 'Usuario sin negocio asociado';
    end if;

    select destination_store_id into v_destination_store_id
      from stock_transfers
     where id = p_transfer_id and tenant_id = v_tenant_id and status = 'in_transit'
     for update;

    if not found then
        raise exception 'Traslado no encontrado, ya recibido/cancelado, o no pertenece a este negocio';
    end if;

    -- --- Recorrer las líneas del traslado, sumando al inventario del destino ---
    for v_item in
        select id, product_id, quantity_requested
          from stock_transfer_items
         where transfer_id = p_transfer_id
    loop
        v_quantity_received := v_item.quantity_requested;
        v_item_override := null;

        -- Si el frontend mandó una cantidad recibida distinta para esta línea
        -- (recepción parcial o con diferencias), se usa esa en su lugar.
        if p_items is not null then
            select (elem ->> 'quantity_received')::numeric into v_item_override
              from jsonb_array_elements(p_items) elem
             where (elem ->> 'item_id')::uuid = v_item.id;

            if v_item_override is not null then
                v_quantity_received := v_item_override;
            end if;
        end if;

        if v_quantity_received < 0 or v_quantity_received > v_item.quantity_requested then
            raise exception 'Cantidad recibida inválida para el producto % (despachado: %)',
                v_item.product_id, v_item.quantity_requested;
        end if;

        update stock_transfer_items
           set quantity_received = v_quantity_received
         where id = v_item.id;

        if v_quantity_received > 0 then
            insert into inventory_stock (tenant_id, product_id, store_id, quantity)
            values (v_tenant_id, v_item.product_id, v_destination_store_id, v_quantity_received)
            on conflict (product_id, store_id)
            do update set quantity = inventory_stock.quantity + excluded.quantity, updated_at = now();

            insert into stock_movements (
                tenant_id, product_id, store_id, movement_type, quantity, reference_id, performed_by
            )
            values (
                v_tenant_id, v_item.product_id, v_destination_store_id, 'transfer_in',
                v_quantity_received, p_transfer_id, auth.uid()
            );
        end if;
    end loop;

    update stock_transfers
       set status = 'received', received_by = auth.uid(), received_at = now()
     where id = p_transfer_id;
end;
$$;

grant execute on function receive_inventory_transfer(uuid, jsonb) to authenticated;

-- ============================================================
-- 3. CANCELACIÓN DE TRASLADO (revierte stock al origen)
-- ============================================================
-- Solo aplica mientras el traslado sigue 'in_transit' — una vez recibido,
-- cualquier corrección debe hacerse con un ajuste de stock normal
-- (request_stock_adjustment), no con esta función.

create or replace function cancel_inventory_transfer(p_transfer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_tenant_id uuid := auth_tenant_id();
    v_origin_store_id uuid;
    v_item record;
begin
    if v_tenant_id is null then
        raise exception 'Usuario sin negocio asociado';
    end if;

    select origin_store_id into v_origin_store_id
      from stock_transfers
     where id = p_transfer_id and tenant_id = v_tenant_id and status = 'in_transit'
     for update;

    if not found then
        raise exception 'Traslado no encontrado, ya recibido/cancelado, o no pertenece a este negocio';
    end if;

    for v_item in
        select product_id, quantity_requested from stock_transfer_items where transfer_id = p_transfer_id
    loop
        update inventory_stock
           set quantity = quantity + v_item.quantity_requested, updated_at = now()
         where product_id = v_item.product_id and store_id = v_origin_store_id;

        insert into stock_movements (
            tenant_id, product_id, store_id, movement_type, quantity, reference_id, performed_by
        )
        values (
            v_tenant_id, v_item.product_id, v_origin_store_id, 'transfer_in',
            v_item.quantity_requested, p_transfer_id, auth.uid()
        );
    end loop;

    update stock_transfers set status = 'rejected' where id = p_transfer_id;
end;
$$;

grant execute on function cancel_inventory_transfer(uuid) to authenticated;

-- ============================================================
-- 4. POLÍTICAS RLS (faltaban en schema.sql — comentario en la línea 433)
-- ============================================================

alter table stock_transfers enable row level security;
create policy tenant_isolation_stock_transfers on stock_transfers
    using (tenant_id = auth_tenant_id())
    with check (tenant_id = auth_tenant_id());

-- stock_transfer_items no tiene tenant_id propio (hereda el del traslado)
alter table stock_transfer_items enable row level security;
create policy tenant_isolation_stock_transfer_items on stock_transfer_items
    using (exists (
        select 1 from stock_transfers st
         where st.id = stock_transfer_items.transfer_id and st.tenant_id = auth_tenant_id()
    ));

create index if not exists idx_stock_transfers_origin on stock_transfers(origin_store_id, status);
create index if not exists idx_stock_transfers_destination on stock_transfers(destination_store_id, status);
