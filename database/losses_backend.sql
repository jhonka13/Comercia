-- ============================================================
-- MERMAS, VENCIMIENTOS Y AJUSTES DE INVENTARIO
-- Requiere: schema.sql, bootstrap_functions.sql, pos_backend.sql aplicados
-- ============================================================

-- ============================================================
-- 1. REGISTRO DE MERMA (inmediata — no requiere aprobación,
--    según el requerimiento original: "registro formal" por motivo)
-- ============================================================
-- p_batch_id es opcional: si el motivo es "expired" (vencido), se espera
-- que el frontend pase el lote más antiguo (FIFO) para descontarlo también
-- de `inventory_batches`, no solo del stock agregado.

create or replace function register_inventory_loss(
    p_store_id uuid,
    p_product_id uuid,
    p_quantity numeric,
    p_reason text,
    p_batch_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_tenant_id uuid := auth_tenant_id();
    v_loss_id uuid;
    v_current_stock numeric;
    v_batch_quantity numeric;
begin
    if v_tenant_id is null then
        raise exception 'Usuario sin negocio asociado';
    end if;

    if p_quantity <= 0 then
        raise exception 'La cantidad de la merma debe ser mayor a cero';
    end if;

    if p_reason not in ('damaged', 'expired', 'theft', 'internal_consumption') then
        raise exception 'Motivo de merma inválido: %', p_reason;
    end if;

    if not exists (select 1 from products where id = p_product_id and tenant_id = v_tenant_id) then
        raise exception 'Producto inválido para este negocio';
    end if;

    if not exists (select 1 from stores where id = p_store_id and tenant_id = v_tenant_id) then
        raise exception 'Tienda inválida para este negocio';
    end if;

    -- Bloquea y descuenta el stock agregado (mismo patrón que process_sale)
    select quantity into v_current_stock
      from inventory_stock
     where product_id = p_product_id and store_id = p_store_id
     for update;

    if not found or v_current_stock < p_quantity then
        raise exception 'Stock insuficiente para registrar esta merma (disponible: %)',
            coalesce(v_current_stock, 0);
    end if;

    update inventory_stock
       set quantity = quantity - p_quantity, updated_at = now()
     where product_id = p_product_id and store_id = p_store_id;

    -- Si se indicó un lote (flujo PEPS/FIFO), también se descuenta de ahí
    if p_batch_id is not null then
        select quantity into v_batch_quantity
          from inventory_batches
         where id = p_batch_id and product_id = p_product_id and store_id = p_store_id
         for update;

        if not found then
            raise exception 'El lote indicado no corresponde a este producto/tienda';
        end if;
        if v_batch_quantity < p_quantity then
            raise exception 'El lote seleccionado no tiene suficiente cantidad (tiene: %)', v_batch_quantity;
        end if;

        update inventory_batches set quantity = quantity - p_quantity where id = p_batch_id;
    end if;

    insert into inventory_losses (
        tenant_id, store_id, product_id, quantity, reason, batch_id, reported_by
    )
    values (v_tenant_id, p_store_id, p_product_id, p_quantity, p_reason, p_batch_id, auth.uid())
    returning id into v_loss_id;

    insert into stock_movements (
        tenant_id, product_id, store_id, movement_type, quantity, reference_id, performed_by
    )
    values (v_tenant_id, p_product_id, p_store_id, 'loss', -p_quantity, v_loss_id, auth.uid());

    return v_loss_id;
end;
$$;

grant execute on function register_inventory_loss(uuid, uuid, numeric, text, uuid) to authenticated;

-- ============================================================
-- 2. AJUSTES DE STOCK CON APROBACIÓN DE SUPERVISOR
-- ============================================================
-- A diferencia de la merma, el ajuste NO toca el stock al crearse — queda
-- 'pending' hasta que alguien con rol de supervisión lo aprueba. Esto separa
-- claramente "quién detecta la discrepancia" (cualquier operador) de "quién
-- autoriza que se corrija el inventario" (control interno real).

create or replace function request_stock_adjustment(
    p_store_id uuid,
    p_product_id uuid,
    p_quantity_delta numeric,
    p_justification text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_tenant_id uuid := auth_tenant_id();
    v_adjustment_id uuid;
begin
    if v_tenant_id is null then
        raise exception 'Usuario sin negocio asociado';
    end if;

    if p_quantity_delta = 0 then
        raise exception 'El ajuste debe tener una cantidad distinta de cero';
    end if;

    if trim(coalesce(p_justification, '')) = '' then
        raise exception 'Todo ajuste de stock requiere una justificación';
    end if;

    if not exists (select 1 from products where id = p_product_id and tenant_id = v_tenant_id) then
        raise exception 'Producto inválido para este negocio';
    end if;

    insert into stock_adjustments (
        tenant_id, store_id, product_id, quantity_delta, justification, requested_by, status
    )
    values (v_tenant_id, p_store_id, p_product_id, p_quantity_delta, p_justification, auth.uid(), 'pending')
    returning id into v_adjustment_id;

    return v_adjustment_id;
end;
$$;

grant execute on function request_stock_adjustment(uuid, uuid, numeric, text) to authenticated;

create or replace function approve_stock_adjustment(p_adjustment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_tenant_id uuid := auth_tenant_id();
    v_role_code text;
    v_store_id uuid;
    v_product_id uuid;
    v_delta numeric;
    v_current_stock numeric;
begin
    select r.code into v_role_code
      from users u join roles r on r.id = u.role_id
     where u.id = auth.uid();

    if v_role_code not in ('supervisor', 'store_admin', 'superadmin') then
        raise exception 'Solo un supervisor o administrador puede aprobar ajustes de stock';
    end if;

    select store_id, product_id, quantity_delta
      into v_store_id, v_product_id, v_delta
      from stock_adjustments
     where id = p_adjustment_id and tenant_id = v_tenant_id and status = 'pending'
     for update;

    if not found then
        raise exception 'Ajuste no encontrado o ya fue procesado';
    end if;

    select quantity into v_current_stock
      from inventory_stock
     where product_id = v_product_id and store_id = v_store_id
     for update;

    if not found then
        if v_delta < 0 then
            raise exception 'No existe stock registrado para este producto en esta tienda';
        end if;
        insert into inventory_stock (tenant_id, product_id, store_id, quantity)
        values (v_tenant_id, v_product_id, v_store_id, v_delta);
    else
        if v_current_stock + v_delta < 0 then
            raise exception 'El ajuste dejaría el stock en negativo (actual: %, ajuste: %)',
                v_current_stock, v_delta;
        end if;
        update inventory_stock
           set quantity = quantity + v_delta, updated_at = now()
         where product_id = v_product_id and store_id = v_store_id;
    end if;

    update stock_adjustments
       set status = 'approved', approved_by = auth.uid()
     where id = p_adjustment_id;

    insert into stock_movements (
        tenant_id, product_id, store_id, movement_type, quantity, reference_id, performed_by
    )
    values (v_tenant_id, v_product_id, v_store_id, 'adjustment', v_delta, p_adjustment_id, auth.uid());
end;
$$;

grant execute on function approve_stock_adjustment(uuid) to authenticated;

create or replace function reject_stock_adjustment(p_adjustment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_tenant_id uuid := auth_tenant_id();
    v_role_code text;
begin
    select r.code into v_role_code
      from users u join roles r on r.id = u.role_id
     where u.id = auth.uid();

    if v_role_code not in ('supervisor', 'store_admin', 'superadmin') then
        raise exception 'Solo un supervisor o administrador puede rechazar ajustes de stock';
    end if;

    update stock_adjustments
       set status = 'rejected', approved_by = auth.uid()
     where id = p_adjustment_id and tenant_id = v_tenant_id and status = 'pending';

    if not found then
        raise exception 'Ajuste no encontrado o ya fue procesado';
    end if;
end;
$$;

grant execute on function reject_stock_adjustment(uuid) to authenticated;

-- ============================================================
-- 3. RLS
-- ============================================================

alter table inventory_batches enable row level security;
create policy tenant_isolation_inventory_batches on inventory_batches
    using (tenant_id = auth_tenant_id())
    with check (tenant_id = auth_tenant_id());

alter table inventory_losses enable row level security;
create policy tenant_isolation_inventory_losses on inventory_losses
    using (tenant_id = auth_tenant_id())
    with check (tenant_id = auth_tenant_id());

alter table stock_adjustments enable row level security;
create policy tenant_isolation_stock_adjustments on stock_adjustments
    using (tenant_id = auth_tenant_id())
    with check (tenant_id = auth_tenant_id());
