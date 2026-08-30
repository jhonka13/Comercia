-- ============================================================
-- SCHEMA: Plataforma SaaS Multitenant - Gestión de Supermercados
-- Motor: PostgreSQL (Supabase)
-- Estrategia multitenant: tenant_id compartido + Row Level Security
-- ============================================================

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ============================================================
-- 1. ARQUITECTURA SAAS Y CONTROL DE ACCESOS
-- ============================================================

create table plans (
    id uuid primary key default gen_random_uuid(),
    name text not null,                 -- Basico, Pro, Enterprise
    max_users int not null,
    max_stores int not null,
    max_products int,
    price_monthly numeric(10,2) not null,
    trial_days int default 14,
    features jsonb default '{}',
    created_at timestamptz default now()
);

create table tenants (
    id uuid primary key default gen_random_uuid(),
    business_name text not null,
    slug text unique not null,          -- subdominio o path
    plan_id uuid references plans(id),
    status text not null default 'trial'
        check (status in ('trial','active','past_due','suspended','cancelled')),
    trial_ends_at timestamptz,
    created_at timestamptz default now()
);

create table subscriptions (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references tenants(id) on delete cascade,
    plan_id uuid not null references plans(id),
    status text not null check (status in ('active','past_due','cancelled')),
    current_period_start timestamptz not null,
    current_period_end timestamptz not null,
    billing_provider text,               -- ej. 'stripe'
    billing_customer_ref text,
    created_at timestamptz default now()
);

-- Roles predefinidos (no dependen de tenant, son catálogo global)
create table roles (
    id uuid primary key default gen_random_uuid(),
    code text unique not null,           -- superadmin, store_admin, cashier, inventory_admin, supervisor
    name text not null
);

create table permissions (
    id uuid primary key default gen_random_uuid(),
    code text unique not null,           -- ej. 'pos.sell', 'inventory.adjust', 'reports.view'
    description text
);

create table role_permissions (
    role_id uuid references roles(id) on delete cascade,
    permission_id uuid references permissions(id) on delete cascade,
    primary key (role_id, permission_id)
);

-- Usuarios de la app (vinculados a auth.users de Supabase vía id)
create table users (
    id uuid primary key,                 -- = auth.users.id
    tenant_id uuid not null references tenants(id) on delete cascade,
    full_name text not null,
    email text not null,
    role_id uuid not null references roles(id),
    store_id uuid,                       -- se referencia luego a stores(id)
    active boolean default true,
    created_at timestamptz default now(),
    unique (tenant_id, email)
);

-- ============================================================
-- 2. TIENDAS / BODEGAS (multi-sucursal)
-- ============================================================

create table stores (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references tenants(id) on delete cascade,
    name text not null,
    type text not null default 'store' check (type in ('store','warehouse')),
    address text,
    is_main boolean default false,
    created_at timestamptz default now()
);

alter table users
    add constraint fk_users_store foreign key (store_id) references stores(id);

create table store_locations (
    id uuid primary key default gen_random_uuid(),
    store_id uuid not null references stores(id) on delete cascade,
    code text not null,                  -- ej. "Pasillo 4 - Estante B"
    description text
);

-- ============================================================
-- 3. CATALOGO DE PRODUCTOS E INVENTARIO
-- ============================================================

create table categories (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references tenants(id) on delete cascade,
    name text not null,
    parent_id uuid references categories(id)
);

create table brands (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references tenants(id) on delete cascade,
    name text not null
);

create table units_of_measure (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references tenants(id) on delete cascade,
    code text not null,                  -- kg, lt, unidad, caja
    name text not null
);

create table taxes (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references tenants(id) on delete cascade,
    name text not null,                  -- IVA 19%
    rate numeric(5,2) not null
);

create table products (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references tenants(id) on delete cascade,
    sku text not null,
    name text not null,
    description text,
    category_id uuid references categories(id),
    brand_id uuid references brands(id),
    unit_id uuid references units_of_measure(id),
    tax_id uuid references taxes(id),
    cost_price numeric(12,2) not null default 0,
    sale_price numeric(12,2) not null default 0,
    bulk_price numeric(12,2),            -- precio por volumen
    -- margen calculado se hace en vista/consulta, no se persiste (evita datos desincronizados)
    is_active boolean default true,
    created_at timestamptz default now(),
    unique (tenant_id, sku)
);

create table product_barcodes (
    id uuid primary key default gen_random_uuid(),
    product_id uuid not null references products(id) on delete cascade,
    barcode text not null,
    is_primary boolean default false,
    unique (barcode)
);

create table product_images (
    id uuid primary key default gen_random_uuid(),
    product_id uuid not null references products(id) on delete cascade,
    storage_path text not null,          -- ruta en Supabase Storage
    is_primary boolean default false
);

-- Ubicación física de un producto dentro de una tienda/bodega
create table product_locations (
    id uuid primary key default gen_random_uuid(),
    product_id uuid not null references products(id) on delete cascade,
    store_location_id uuid not null references store_locations(id) on delete cascade
);

-- Stock por producto y por tienda (no global)
create table inventory_stock (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references tenants(id) on delete cascade,
    product_id uuid not null references products(id) on delete cascade,
    store_id uuid not null references stores(id) on delete cascade,
    quantity numeric(12,3) not null default 0,
    min_quantity numeric(12,3) default 0,   -- para alertas de reabastecimiento
    updated_at timestamptz default now(),
    unique (product_id, store_id)
);

-- Lotes con fecha de vencimiento (soporte PEPS/FIFO)
create table inventory_batches (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references tenants(id) on delete cascade,
    product_id uuid not null references products(id) on delete cascade,
    store_id uuid not null references stores(id) on delete cascade,
    batch_code text,
    quantity numeric(12,3) not null,
    expiration_date date,
    received_at timestamptz default now()
);

create index idx_batches_expiration on inventory_batches(expiration_date);

-- ============================================================
-- 4. POS / VENTAS
-- ============================================================

create table cash_registers (
    id uuid primary key default gen_random_uuid(),
    store_id uuid not null references stores(id) on delete cascade,
    name text not null                    -- Caja 1, Caja 2
);

create table cash_shifts (
    id uuid primary key default gen_random_uuid(),
    cash_register_id uuid not null references cash_registers(id),
    cashier_id uuid not null references users(id),
    opening_amount numeric(12,2) not null,
    closing_amount numeric(12,2),
    expected_amount numeric(12,2),        -- calculado al cierre
    status text not null default 'open' check (status in ('open','closed')),
    opened_at timestamptz default now(),
    closed_at timestamptz
);

create table customers (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references tenants(id) on delete cascade,
    full_name text not null,
    document_id text,
    email text,
    phone text,
    loyalty_points int default 0,
    credit_limit numeric(12,2) default 0,
    credit_balance numeric(12,2) default 0,
    created_at timestamptz default now()
);

create table sales (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references tenants(id) on delete cascade,
    store_id uuid not null references stores(id),
    cash_shift_id uuid references cash_shifts(id),
    cashier_id uuid not null references users(id),
    customer_id uuid references customers(id),
    subtotal numeric(12,2) not null,
    tax_total numeric(12,2) not null default 0,
    total numeric(12,2) not null,
    status text not null default 'completed' check (status in ('completed','voided','refunded')),
    created_at timestamptz default now()
);

create table sale_items (
    id uuid primary key default gen_random_uuid(),
    sale_id uuid not null references sales(id) on delete cascade,
    product_id uuid not null references products(id),
    quantity numeric(12,3) not null,
    unit_price numeric(12,2) not null,
    tax_amount numeric(12,2) not null default 0,
    subtotal numeric(12,2) not null
);

create table sale_payments (
    id uuid primary key default gen_random_uuid(),
    sale_id uuid not null references sales(id) on delete cascade,
    method text not null check (method in ('cash','card','transfer','credit')),
    amount numeric(12,2) not null,
    change_given numeric(12,2) default 0   -- solo aplica a 'cash'
);

-- ============================================================
-- 5. LOGISTICA INTERNA Y TRASLADOS
-- ============================================================

create table stock_transfers (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references tenants(id) on delete cascade,
    origin_store_id uuid not null references stores(id),
    destination_store_id uuid not null references stores(id),
    status text not null default 'pending'
        check (status in ('pending','in_transit','received','rejected')),
    requested_by uuid not null references users(id),
    dispatched_by uuid references users(id),
    received_by uuid references users(id),
    created_at timestamptz default now(),
    dispatched_at timestamptz,
    received_at timestamptz
);

create table stock_transfer_items (
    id uuid primary key default gen_random_uuid(),
    transfer_id uuid not null references stock_transfers(id) on delete cascade,
    product_id uuid not null references products(id),
    quantity_requested numeric(12,3) not null,
    quantity_received numeric(12,3)
);

-- Auditoría unificada de todo movimiento de stock (venta, traslado, ajuste, merma)
create table stock_movements (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references tenants(id) on delete cascade,
    product_id uuid not null references products(id),
    store_id uuid not null references stores(id),
    movement_type text not null
        check (movement_type in ('sale','transfer_out','transfer_in','adjustment','loss','purchase_in')),
    quantity numeric(12,3) not null,       -- positivo = entrada, negativo = salida
    reference_id uuid,                     -- id de sale/transfer/loss/adjustment relacionado
    performed_by uuid not null references users(id),
    created_at timestamptz default now()
);

create index idx_stock_movements_product on stock_movements(product_id, store_id);

-- ============================================================
-- 6. PERDIDAS, VENCIMIENTOS Y BAJAS
-- ============================================================

create table inventory_losses (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references tenants(id) on delete cascade,
    store_id uuid not null references stores(id),
    product_id uuid not null references products(id),
    quantity numeric(12,3) not null,
    reason text not null
        check (reason in ('damaged','expired','theft','internal_consumption')),
    batch_id uuid references inventory_batches(id),
    reported_by uuid not null references users(id),
    approved_by uuid references users(id),
    created_at timestamptz default now()
);

create table stock_adjustments (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references tenants(id) on delete cascade,
    store_id uuid not null references stores(id),
    product_id uuid not null references products(id),
    quantity_delta numeric(12,3) not null,  -- + o -
    justification text not null,
    requested_by uuid not null references users(id),
    approved_by uuid references users(id),  -- requiere supervisor
    status text not null default 'pending' check (status in ('pending','approved','rejected')),
    created_at timestamptz default now()
);

-- ============================================================
-- 7. PROVEEDORES Y COMPRAS
-- ============================================================

create table suppliers (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references tenants(id) on delete cascade,
    name text not null,
    contact_name text,
    email text,
    phone text,
    payment_terms_days int default 0
);

create table purchase_orders (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references tenants(id) on delete cascade,
    supplier_id uuid not null references suppliers(id),
    store_id uuid not null references stores(id),
    status text not null default 'pending'
        check (status in ('pending','ordered','received','cancelled')),
    expected_date date,
    created_by uuid not null references users(id),
    created_at timestamptz default now()
);

create table purchase_order_items (
    id uuid primary key default gen_random_uuid(),
    purchase_order_id uuid not null references purchase_orders(id) on delete cascade,
    product_id uuid not null references products(id),
    quantity numeric(12,3) not null,
    unit_cost numeric(12,2) not null
);

create table accounts_payable (
    id uuid primary key default gen_random_uuid(),
    supplier_id uuid not null references suppliers(id),
    purchase_order_id uuid references purchase_orders(id),
    amount numeric(12,2) not null,
    due_date date not null,
    status text not null default 'pending' check (status in ('pending','paid','overdue')),
    created_at timestamptz default now()
);

-- ============================================================
-- 8. FIDELIZACION Y CREDITO DE CLIENTES
-- ============================================================

create table loyalty_transactions (
    id uuid primary key default gen_random_uuid(),
    customer_id uuid not null references customers(id) on delete cascade,
    sale_id uuid references sales(id),
    points_delta int not null,
    reason text,
    created_at timestamptz default now()
);

create table credit_transactions (
    id uuid primary key default gen_random_uuid(),
    customer_id uuid not null references customers(id) on delete cascade,
    sale_id uuid references sales(id),
    amount numeric(12,2) not null,          -- + cargo, - abono
    type text not null check (type in ('charge','payment')),
    created_at timestamptz default now()
);

-- ============================================================
-- ROW LEVEL SECURITY (aislamiento multitenant)
-- ============================================================
-- Patrón: cada tabla de negocio filtra por tenant_id = tenant del usuario autenticado.
-- Requiere una función que resuelva el tenant_id del usuario actual.

create or replace function auth_tenant_id() returns uuid as $$
    select tenant_id from users where id = auth.uid()
$$ language sql stable security definer;

-- Ejemplo de política (repetir para cada tabla con tenant_id):
alter table products enable row level security;
create policy tenant_isolation_products on products
    using (tenant_id = auth_tenant_id())
    with check (tenant_id = auth_tenant_id());

alter table sales enable row level security;
create policy tenant_isolation_sales on sales
    using (tenant_id = auth_tenant_id())
    with check (tenant_id = auth_tenant_id());

-- Repetir el mismo patrón (enable RLS + policy) en:
-- stores, categories, brands, units_of_measure, taxes, inventory_stock,
-- inventory_batches, customers, stock_transfers, stock_movements,
-- inventory_losses, stock_adjustments, suppliers, purchase_orders,
-- accounts_payable, users (además de RLS, users se filtra también por rol)

-- ============================================================
-- INDICES ADICIONALES RECOMENDADOS
-- ============================================================
create index idx_products_tenant on products(tenant_id);
create index idx_sales_tenant_date on sales(tenant_id, created_at);
create index idx_inventory_stock_low on inventory_stock(store_id, product_id) where quantity <= min_quantity;
