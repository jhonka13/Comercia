-- ============================================================
-- MÓDULO 6: MOTOR DE ABASTECIMIENTO + FINANZAS DE MERMAS
-- Requiere: schema.sql, bootstrap_functions.sql, pos_backend.sql y
--           losses_backend.sql ya aplicados (usa auth_tenant_id(),
--           inventory_losses, stock_adjustments, suppliers, etc.)
--
-- Contenido:
--   1. Columnas nuevas (proveedor preferido, clasificación de merma)
--   2. Tabla loss_recoveries (gestión de reintegro con proveedor)
--   3. register_inventory_loss (extendida) + resolve_loss_recovery
--   4. get_low_stock_alerts + get_purchase_suggestions
--   5. create_purchase_order (atómica)
--   6. get_loss_recovery_report + list_loss_recoveries
--   7. RLS de todas las tablas que faltaban (suppliers, purchase_orders,
--      purchase_order_items, accounts_payable, categories, brands,
--      units_of_measure, taxes, loss_recoveries) — varias de estas
--      tablas quedaron SIN RLS en schema.sql (solo estaban comentadas
--      como "pendiente"); si vas a comercializar el sistema a distintos
--      negocios, esto no es opcional.
-- ============================================================

-- ============================================================
-- 1. COLUMNAS NUEVAS
-- ============================================================

-- Nota de diseño: el requerimiento pide un campo `min_stock_alert`, pero el
-- esquema ya tiene `inventory_stock.min_quantity` cumpliendo exactamente ese
-- rol (umbral de alerta por producto+tienda). Se reutiliza esa columna en
-- vez de duplicarla — ver `get_low_stock_alerts` más abajo.

alter table products
    add column if not exists preferred_supplier_id uuid references suppliers(id);

comment on column products.preferred_supplier_id is
    'Proveedor sugerido por defecto para reabastecer este producto. Nulo = sin proveedor asignado (la sugerencia de compra lo agrupa aparte).';

-- Clasificación contable de la merma: pérdida neta asumida por el negocio,
-- o pendiente de gestión con el proveedor (nota crédito / reposición / reembolso).
alter table inventory_losses
    add column if not exists classification text not null default 'net_loss'
        check (classification in ('net_loss', 'supplier_return')),
    add column if not exists supplier_id uuid references suppliers(id),
    add column if not exists recovery_status text not null default 'not_applicable'
        check (recovery_status in ('not_applicable', 'pending', 'recovered', 'denied'));

comment on column inventory_losses.classification is
    'net_loss = pérdida asumida directamente. supplier_return = se gestiona reintegro con el proveedor (ver loss_recoveries).';
comment on column inventory_losses.recovery_status is
    'not_applicable para net_loss. pending/recovered/denied para supplier_return, según el estado de loss_recoveries.';

create index if not exists idx_inventory_losses_recovery
    on inventory_losses(tenant_id, recovery_status) where classification = 'supplier_return';

-- ============================================================
-- 2. GESTIÓN DE REINTEGRO CON PROVEEDOR
-- ============================================================
-- Una fila por merma clasificada como 'supplier_return'. Nace 'pending' al
-- registrar la merma y se resuelve después (cuando el proveedor efectivamente
-- entrega la nota crédito / repone mercancía / devuelve dinero, o cuando
-- niega la garantía).

create table if not exists loss_recoveries (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references tenants(id) on delete cascade,
    loss_id uuid not null unique references inventory_losses(id) on delete cascade,
    supplier_id uuid not null references suppliers(id),
    method text check (method in ('credit_note', 'replacement', 'refund')),
    -- Valor monetario recuperado (nota crédito o reembolso). Para reposición
    -- física, el valor se calcula a costo (quantity_replaced * costo del producto)
    -- y también se refleja aquí para que el reporte financiero sume una sola cifra.
    amount numeric(12,2) not null default 0,
    quantity_replaced numeric(12,3) not null default 0,
    status text not null default 'pending' check (status in ('pending', 'confirmed', 'denied')),
    notes text,
    requested_by uuid not null references users(id),
    resolved_by uuid references users(id),
    created_at timestamptz default now(),
    resolved_at timestamptz
);

create index if not exists idx_loss_recoveries_status on loss_recoveries(tenant_id, status);

-- ============================================================
-- 3. REGISTRO DE MERMA (EXTENDIDO) + RESOLUCIÓN DE RECUPERACIÓN
-- ============================================================
-- Mismo cuerpo que losses_backend.sql, con dos parámetros nuevos al final
-- (con default, para no romper las llamadas existentes desde el frontend
-- viejo): p_classification y p_supplier_id.

create or replace function register_inventory_loss(
    p_store_id uuid,
    p_product_id uuid,
    p_quantity numeric,
    p_reason text,
    p_batch_id uuid default null,
    p_classification text default 'net_loss',
    p_supplier_id uuid default null
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

    if p_classification not in ('net_loss', 'supplier_return') then
        raise exception 'Clasificación de merma inválida: %', p_classification;
    end if;

    if p_classification = 'supplier_return' then
        if p_supplier_id is null then
            raise exception 'Debes indicar el proveedor para gestionar el reintegro';
        end if;
        if p_reason = 'theft' then
            raise exception 'Un hurto no puede clasificarse como devolución a proveedor';
        end if;
        if not exists (select 1 from suppliers where id = p_supplier_id and tenant_id = v_tenant_id) then
            raise exception 'Proveedor inválido para este negocio';
        end if;
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
        tenant_id, store_id, product_id, quantity, reason, batch_id, reported_by,
        classification, supplier_id, recovery_status
    )
    values (
        v_tenant_id, p_store_id, p_product_id, p_quantity, p_reason, p_batch_id, auth.uid(),
        p_classification, p_supplier_id,
        case when p_classification = 'supplier_return' then 'pending' else 'not_applicable' end
    )
    returning id into v_loss_id;

    if p_classification = 'supplier_return' then
        insert into loss_recoveries (tenant_id, loss_id, supplier_id, status, requested_by)
        values (v_tenant_id, v_loss_id, p_supplier_id, 'pending', auth.uid());
    end if;

    insert into stock_movements (
        tenant_id, product_id, store_id, movement_type, quantity, reference_id, performed_by
    )
    values (v_tenant_id, p_product_id, p_store_id, 'loss', -p_quantity, v_loss_id, auth.uid());

    return v_loss_id;
end;
$$;

grant execute on function register_inventory_loss(uuid, uuid, numeric, text, uuid, text, uuid) to authenticated;

-- Cierra el ciclo: el supervisor/administrador confirma lo que el proveedor
-- efectivamente reconoció, o lo marca como negado (en cuyo caso el impacto
-- financiero pasa a contarse como pérdida neta en el reporte, aunque la
-- clasificación original de la merma no cambia — queda la trazabilidad de
-- que SÍ se intentó la gestión).
create or replace function resolve_loss_recovery(
    p_loss_id uuid,
    p_status text,          -- 'confirmed' | 'denied'
    p_method text default null,          -- 'credit_note' | 'replacement' | 'refund'
    p_amount numeric default 0,
    p_quantity_replaced numeric default 0,
    p_notes text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_tenant_id uuid := auth_tenant_id();
    v_role_code text;
    v_recovery_id uuid;
begin
    select r.code into v_role_code
      from users u join roles r on r.id = u.role_id
     where u.id = auth.uid();

    if v_role_code not in ('supervisor', 'store_admin', 'superadmin') then
        raise exception 'Solo un supervisor o administrador puede resolver una recuperación de merma';
    end if;

    if p_status not in ('confirmed', 'denied') then
        raise exception 'Estado de resolución inválido: %', p_status;
    end if;

    if p_status = 'confirmed' then
        if p_method is null or p_method not in ('credit_note', 'replacement', 'refund') then
            raise exception 'Debes indicar cómo se recuperó (nota crédito, reposición o devolución de dinero)';
        end if;
        if p_method = 'replacement' and p_quantity_replaced <= 0 then
            raise exception 'Indica la cantidad repuesta por el proveedor';
        end if;
        if p_method in ('credit_note', 'refund') and p_amount <= 0 then
            raise exception 'Indica el valor monetario recuperado';
        end if;
    end if;

    select lr.id into v_recovery_id
      from loss_recoveries lr
      join inventory_losses il on il.id = lr.loss_id
     where lr.loss_id = p_loss_id and lr.tenant_id = v_tenant_id and lr.status = 'pending'
     for update;

    if not found then
        raise exception 'No hay una recuperación pendiente para esta merma';
    end if;

    update loss_recoveries
       set status = p_status,
           method = p_method,
           amount = coalesce(p_amount, 0),
           quantity_replaced = coalesce(p_quantity_replaced, 0),
           notes = p_notes,
           resolved_by = auth.uid(),
           resolved_at = now()
     where id = v_recovery_id;

    update inventory_losses
       set recovery_status = case when p_status = 'confirmed' then 'recovered' else 'denied' end
     where id = p_loss_id;
end;
$$;

grant execute on function resolve_loss_recovery(uuid, text, text, numeric, numeric, text) to authenticated;

-- ============================================================
-- 4. ALERTAS DE STOCK Y SUGERENCIAS DE ABASTECIMIENTO
-- ============================================================

create or replace function get_low_stock_alerts(p_store_id uuid)
returns table (
    product_id uuid,
    product_name text,
    sku text,
    unit_code text,
    current_quantity numeric,
    min_quantity numeric,
    deficit numeric,
    supplier_id uuid,
    supplier_name text
)
language sql
stable
security definer
set search_path = public
as $$
    select
        p.id,
        p.name,
        p.sku,
        u.code,
        s.quantity,
        s.min_quantity,
        greatest(s.min_quantity - s.quantity, 0) as deficit,
        sup.id,
        sup.name
    from inventory_stock s
    join products p on p.id = s.product_id
    left join units_of_measure u on u.id = p.unit_id
    left join suppliers sup on sup.id = p.preferred_supplier_id
    where s.store_id = p_store_id
      and s.tenant_id = auth_tenant_id()
      and p.is_active = true
      and s.min_quantity > 0
      and s.quantity <= s.min_quantity
    order by (s.quantity / nullif(s.min_quantity, 0)) asc;
$$;

grant execute on function get_low_stock_alerts(uuid) to authenticated;

-- Sugerencia de cantidad a pedir: cubre el doble del mínimo configurado Y,
-- si hay historial de venta reciente, también cubre `p_coverage_days` de
-- ventas al ritmo promedio observado en los últimos `p_lookback_days` — se
-- pide lo que sea mayor entre las dos referencias, para no quedarse corto en
-- productos de alta rotación cuyo mínimo quedó desactualizado.
create or replace function get_purchase_suggestions(
    p_store_id uuid,
    p_coverage_days int default 14,
    p_lookback_days int default 30
)
returns table (
    product_id uuid,
    product_name text,
    sku text,
    unit_code text,
    current_quantity numeric,
    min_quantity numeric,
    avg_daily_sales numeric,
    suggested_quantity numeric,
    unit_cost numeric,
    estimated_cost numeric,
    supplier_id uuid,
    supplier_name text
)
language sql
stable
security definer
set search_path = public
as $$
    with sales_rate as (
        select
            sm.product_id,
            sum(-sm.quantity) / greatest(p_lookback_days, 1) as avg_daily_sales
        from stock_movements sm
        where sm.store_id = p_store_id
          and sm.tenant_id = auth_tenant_id()
          and sm.movement_type = 'sale'
          and sm.created_at >= now() - (p_lookback_days || ' days')::interval
        group by sm.product_id
    )
    select
        p.id,
        p.name,
        p.sku,
        u.code,
        s.quantity,
        s.min_quantity,
        coalesce(round(sr.avg_daily_sales, 3), 0),
        greatest(
            (s.min_quantity * 2) - s.quantity,
            ceil(coalesce(sr.avg_daily_sales, 0) * p_coverage_days) - s.quantity,
            0
        ) as suggested_quantity,
        p.cost_price,
        round(
            greatest(
                (s.min_quantity * 2) - s.quantity,
                ceil(coalesce(sr.avg_daily_sales, 0) * p_coverage_days) - s.quantity,
                0
            ) * p.cost_price, 2
        ) as estimated_cost,
        sup.id,
        sup.name
    from inventory_stock s
    join products p on p.id = s.product_id
    left join units_of_measure u on u.id = p.unit_id
    left join suppliers sup on sup.id = p.preferred_supplier_id
    left join sales_rate sr on sr.product_id = p.id
    where s.store_id = p_store_id
      and s.tenant_id = auth_tenant_id()
      and p.is_active = true
      and s.min_quantity > 0
      and s.quantity <= s.min_quantity
    order by sup.name nulls last, p.name;
$$;

grant execute on function get_purchase_suggestions(uuid, int, int) to authenticated;

-- ============================================================
-- 5. CREACIÓN ATÓMICA DE ORDEN DE COMPRA
-- ============================================================
-- p_items: [{ "product_id": uuid, "quantity": number, "unit_cost": number }, ...]

create or replace function create_purchase_order(
    p_store_id uuid,
    p_supplier_id uuid,
    p_items jsonb,
    p_expected_date date default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_tenant_id uuid := auth_tenant_id();
    v_po_id uuid;
    v_item jsonb;
begin
    if v_tenant_id is null then
        raise exception 'Usuario sin negocio asociado';
    end if;

    if jsonb_array_length(p_items) = 0 then
        raise exception 'La orden de compra no tiene productos';
    end if;

    if not exists (select 1 from stores where id = p_store_id and tenant_id = v_tenant_id) then
        raise exception 'Tienda inválida para este negocio';
    end if;

    if not exists (select 1 from suppliers where id = p_supplier_id and tenant_id = v_tenant_id) then
        raise exception 'Proveedor inválido para este negocio';
    end if;

    insert into purchase_orders (tenant_id, supplier_id, store_id, status, expected_date, created_by)
    values (v_tenant_id, p_supplier_id, p_store_id, 'pending', p_expected_date, auth.uid())
    returning id into v_po_id;

    for v_item in select * from jsonb_array_elements(p_items)
    loop
        if (v_item ->> 'quantity')::numeric <= 0 then
            raise exception 'Cantidad inválida en la línea de la orden de compra';
        end if;
        if not exists (
            select 1 from products where id = (v_item ->> 'product_id')::uuid and tenant_id = v_tenant_id
        ) then
            raise exception 'El producto % no pertenece a este negocio', v_item ->> 'product_id';
        end if;

        insert into purchase_order_items (purchase_order_id, product_id, quantity, unit_cost)
        values (
            v_po_id,
            (v_item ->> 'product_id')::uuid,
            (v_item ->> 'quantity')::numeric,
            (v_item ->> 'unit_cost')::numeric
        );
    end loop;

    return v_po_id;
end;
$$;

grant execute on function create_purchase_order(uuid, uuid, jsonb, date) to authenticated;

-- ============================================================
-- 6. REPORTE DE RECUPERACIÓN FINANCIERA POR MERMAS
-- ============================================================

create or replace function get_loss_recovery_report(
    p_store_id uuid,
    p_date_from date default null,
    p_date_to date default null
)
returns table (
    losses_count bigint,
    total_loss_value numeric,          -- impacto bruto de TODAS las mermas, a costo
    net_loss_value numeric,            -- net_loss + supplier_return denegadas
    pending_recovery_value numeric,    -- supplier_return con recuperación pendiente
    recovered_value numeric,           -- confirmado: dinero + (unidades repuestas * costo)
    recovery_rate_pct numeric          -- recovered_value / (recovered_value + net_loss_value + pending_recovery_value)
)
language sql
stable
security definer
set search_path = public
as $$
    with base as (
        select
            il.id,
            il.quantity * p.cost_price as impact,
            il.classification,
            il.recovery_status,
            coalesce(lr.amount, 0) + coalesce(lr.quantity_replaced, 0) * p.cost_price as recovery_amount
        from inventory_losses il
        join products p on p.id = il.product_id
        left join loss_recoveries lr on lr.loss_id = il.id
        where il.store_id = p_store_id
          and il.tenant_id = auth_tenant_id()
          and (p_date_from is null or il.created_at::date >= p_date_from)
          and (p_date_to is null or il.created_at::date <= p_date_to)
    )
    select
        count(*),
        coalesce(sum(impact), 0),
        coalesce(sum(impact) filter (
            where classification = 'net_loss' or recovery_status = 'denied'
        ), 0),
        coalesce(sum(impact) filter (
            where classification = 'supplier_return' and recovery_status = 'pending'
        ), 0),
        coalesce(sum(recovery_amount) filter (
            where classification = 'supplier_return' and recovery_status = 'recovered'
        ), 0),
        case
            when coalesce(sum(impact) filter (where recovery_status <> 'recovered'), 0)
                 + coalesce(sum(recovery_amount) filter (where recovery_status = 'recovered'), 0) = 0
            then 0
            else round(
                100 * coalesce(sum(recovery_amount) filter (where recovery_status = 'recovered'), 0)
                / nullif(
                    coalesce(sum(impact) filter (
                        where classification = 'net_loss' or recovery_status in ('pending', 'denied')
                    ), 0)
                    + coalesce(sum(recovery_amount) filter (where recovery_status = 'recovered'), 0),
                    0
                ), 1
            )
        end
    from base;
$$;

grant execute on function get_loss_recovery_report(uuid, date, date) to authenticated;

-- Detalle para el panel de gestión (pendientes) y la tabla del reporte
create or replace function list_loss_recoveries(p_store_id uuid, p_status text default null)
returns table (
    loss_id uuid,
    recovery_id uuid,
    product_id uuid,
    product_name text,
    sku text,
    quantity numeric,
    reason text,
    cost_price numeric,
    loss_value numeric,
    supplier_id uuid,
    supplier_name text,
    method text,
    amount numeric,
    quantity_replaced numeric,
    status text,
    notes text,
    created_at timestamptz,
    resolved_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
    select
        il.id,
        lr.id,
        p.id,
        p.name,
        p.sku,
        il.quantity,
        il.reason,
        p.cost_price,
        il.quantity * p.cost_price,
        sup.id,
        sup.name,
        lr.method,
        lr.amount,
        lr.quantity_replaced,
        lr.status,
        lr.notes,
        lr.created_at,
        lr.resolved_at
    from loss_recoveries lr
    join inventory_losses il on il.id = lr.loss_id
    join products p on p.id = il.product_id
    join suppliers sup on sup.id = lr.supplier_id
    where il.store_id = p_store_id
      and lr.tenant_id = auth_tenant_id()
      and (p_status is null or lr.status = p_status)
    order by lr.created_at desc;
$$;

grant execute on function list_loss_recoveries(uuid, text) to authenticated;

-- ============================================================
-- 7. RLS FALTANTE (tablas que en schema.sql quedaron sin política)
-- ============================================================

alter table loss_recoveries enable row level security;
create policy tenant_isolation_loss_recoveries on loss_recoveries
    using (tenant_id = auth_tenant_id())
    with check (tenant_id = auth_tenant_id());

alter table suppliers enable row level security;
create policy tenant_isolation_suppliers on suppliers
    using (tenant_id = auth_tenant_id())
    with check (tenant_id = auth_tenant_id());

alter table purchase_orders enable row level security;
create policy tenant_isolation_purchase_orders on purchase_orders
    using (tenant_id = auth_tenant_id())
    with check (tenant_id = auth_tenant_id());

alter table purchase_order_items enable row level security;
create policy tenant_isolation_purchase_order_items on purchase_order_items
    using (exists (
        select 1 from purchase_orders po
         where po.id = purchase_order_items.purchase_order_id and po.tenant_id = auth_tenant_id()
    ));

alter table accounts_payable enable row level security;
create policy tenant_isolation_accounts_payable on accounts_payable
    using (exists (
        select 1 from suppliers sup
         where sup.id = accounts_payable.supplier_id and sup.tenant_id = auth_tenant_id()
    ));

alter table categories enable row level security;
create policy tenant_isolation_categories on categories
    using (tenant_id = auth_tenant_id())
    with check (tenant_id = auth_tenant_id());

alter table brands enable row level security;
create policy tenant_isolation_brands on brands
    using (tenant_id = auth_tenant_id())
    with check (tenant_id = auth_tenant_id());

alter table units_of_measure enable row level security;
create policy tenant_isolation_units_of_measure on units_of_measure
    using (tenant_id = auth_tenant_id())
    with check (tenant_id = auth_tenant_id());

alter table taxes enable row level security;
create policy tenant_isolation_taxes on taxes
    using (tenant_id = auth_tenant_id())
    with check (tenant_id = auth_tenant_id());

-- ============================================================
-- ÍNDICES ADICIONALES
-- ============================================================
create index if not exists idx_products_preferred_supplier on products(preferred_supplier_id);
create index if not exists idx_stock_movements_sale_lookup
    on stock_movements(store_id, movement_type, created_at) where movement_type = 'sale';
