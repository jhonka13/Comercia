-- ============================================================
-- POS BACKEND: venta atómica + apertura/cierre de caja + RLS
-- Requiere: schema.sql y bootstrap_functions.sql ya aplicados
-- ============================================================

-- ============================================================
-- 1. APERTURA Y CIERRE DE TURNO DE CAJA
-- ============================================================

create or replace function open_cash_shift(p_cash_register_id uuid, p_opening_amount numeric)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_tenant_id uuid := auth_tenant_id();
    v_shift_id uuid;
begin
    if not exists (
        select 1 from cash_registers cr
        join stores st on st.id = cr.store_id
        where cr.id = p_cash_register_id and st.tenant_id = v_tenant_id
    ) then
        raise exception 'Caja inválida para este negocio';
    end if;

    if exists (
        select 1 from cash_shifts
        where cash_register_id = p_cash_register_id and status = 'open'
    ) then
        raise exception 'Ya hay un turno abierto en esta caja';
    end if;

    insert into cash_shifts (cash_register_id, cashier_id, opening_amount, status)
    values (p_cash_register_id, auth.uid(), p_opening_amount, 'open')
    returning id into v_shift_id;

    return v_shift_id;
end;
$$;

grant execute on function open_cash_shift(uuid, numeric) to authenticated;

create or replace function close_cash_shift(p_shift_id uuid, p_closing_amount numeric)
returns table (expected_amount numeric, difference numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_opening numeric;
    v_cash_net numeric;
    v_expected numeric;
begin
    select opening_amount into v_opening
      from cash_shifts
     where id = p_shift_id and cashier_id = auth.uid() and status = 'open';

    if not found then
        raise exception 'Turno no encontrado, ya cerrado, o no pertenece a este usuario';
    end if;

    -- Efectivo neto recibido en el turno: lo cobrado menos el cambio entregado
    select coalesce(sum(sp.amount - sp.change_given), 0) into v_cash_net
      from sale_payments sp
      join sales s on s.id = sp.sale_id
     where s.cash_shift_id = p_shift_id and sp.method = 'cash';

    v_expected := v_opening + v_cash_net;

    update cash_shifts
       set closing_amount = p_closing_amount,
           expected_amount = v_expected,
           status = 'closed',
           closed_at = now()
     where id = p_shift_id;

    return query select v_expected, p_closing_amount - v_expected;
end;
$$;

grant execute on function close_cash_shift(uuid, numeric) to authenticated;

-- ============================================================
-- 2. PROCESAMIENTO ATÓMICO DE VENTA
-- ============================================================
-- p_items:    [{ "product_id": uuid, "quantity": number, "unit_price": number, "tax_amount": number }, ...]
-- p_payments: [{ "method": "cash"|"card"|"transfer"|"credit", "amount": number, "change_given": number }, ...]
--
-- Todo corre en una sola transacción implícita de PL/pgSQL: si cualquier
-- paso falla (stock insuficiente, cupo de crédito excedido, pago
-- incompleto), toda la función se revierte — no puede quedar una venta
-- registrada sin su descuento de stock, ni viceversa.

create or replace function process_sale(
    p_store_id uuid,
    p_cash_shift_id uuid,
    p_customer_id uuid,
    p_items jsonb,
    p_payments jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_tenant_id uuid := auth_tenant_id();
    v_sale_id uuid;
    v_subtotal numeric := 0;
    v_tax_total numeric := 0;
    v_total numeric := 0;
    v_paid_net numeric := 0;
    v_credit_total numeric := 0;
    v_item jsonb;
    v_payment jsonb;
    v_product_id uuid;
    v_quantity numeric;
    v_unit_price numeric;
    v_tax_amount numeric;
    v_line_subtotal numeric;
    v_current_stock numeric;
    v_customer_limit numeric;
    v_customer_balance numeric;
begin
    if v_tenant_id is null then
        raise exception 'Usuario sin negocio asociado';
    end if;

    if jsonb_array_length(p_items) = 0 then
        raise exception 'La venta no tiene productos';
    end if;

    if not exists (select 1 from stores where id = p_store_id and tenant_id = v_tenant_id) then
        raise exception 'Tienda inválida para este negocio';
    end if;

    if p_cash_shift_id is not null and not exists (
        select 1
          from cash_shifts cs
          join cash_registers cr on cr.id = cs.cash_register_id
          join stores st on st.id = cr.store_id
         where cs.id = p_cash_shift_id and st.tenant_id = v_tenant_id and cs.status = 'open'
    ) then
        raise exception 'El turno de caja indicado no está abierto o no es válido';
    end if;

    -- --- Paso 1: recorrer líneas, validar producto, bloquear y descontar stock ---
    for v_item in select * from jsonb_array_elements(p_items)
    loop
        v_product_id := (v_item ->> 'product_id')::uuid;
        v_quantity := (v_item ->> 'quantity')::numeric;
        v_unit_price := (v_item ->> 'unit_price')::numeric;
        v_tax_amount := coalesce((v_item ->> 'tax_amount')::numeric, 0);

        if v_quantity <= 0 then
            raise exception 'Cantidad inválida en la línea de producto %', v_product_id;
        end if;

        if not exists (select 1 from products where id = v_product_id and tenant_id = v_tenant_id) then
            raise exception 'El producto % no pertenece a este negocio', v_product_id;
        end if;

        v_line_subtotal := v_unit_price * v_quantity;
        v_subtotal := v_subtotal + v_line_subtotal;
        v_tax_total := v_tax_total + v_tax_amount;

        -- SELECT ... FOR UPDATE: bloquea la fila hasta el fin de la
        -- transacción. Si dos cajeros venden el mismo producto al mismo
        -- tiempo, la segunda transacción espera a que la primera termine
        -- (o falla si ya no queda stock) — así se evita la sobreventa.
        select quantity into v_current_stock
          from inventory_stock
         where product_id = v_product_id and store_id = p_store_id
         for update;

        if not found or v_current_stock < v_quantity then
            raise exception 'Stock insuficiente para el producto % (disponible: %)',
                v_product_id, coalesce(v_current_stock, 0);
        end if;

        update inventory_stock
           set quantity = quantity - v_quantity, updated_at = now()
         where product_id = v_product_id and store_id = p_store_id;
    end loop;

    v_total := v_subtotal + v_tax_total;

    -- --- Paso 2: validar que los pagos cubren el total ---
    for v_payment in select * from jsonb_array_elements(p_payments)
    loop
        v_paid_net := v_paid_net
            + (v_payment ->> 'amount')::numeric
            - coalesce((v_payment ->> 'change_given')::numeric, 0);
        if (v_payment ->> 'method') = 'credit' then
            v_credit_total := v_credit_total + (v_payment ->> 'amount')::numeric;
        end if;
    end loop;

    if v_paid_net < v_total - 0.01 then
        raise exception 'Los pagos (%) no cubren el total de la venta (%)', v_paid_net, v_total;
    end if;

    -- --- Paso 3: validar cupo de crédito si aplica ---
    if v_credit_total > 0 then
        if p_customer_id is null then
            raise exception 'Una venta a crédito requiere un cliente';
        end if;

        select credit_limit, credit_balance into v_customer_limit, v_customer_balance
          from customers
         where id = p_customer_id and tenant_id = v_tenant_id;

        if not found then
            raise exception 'Cliente no encontrado';
        end if;

        if v_customer_balance + v_credit_total > v_customer_limit then
            raise exception 'El cliente no tiene cupo de crédito suficiente';
        end if;
    end if;

    -- --- Paso 4: insertar la venta ---
    insert into sales (
        tenant_id, store_id, cash_shift_id, cashier_id, customer_id,
        subtotal, tax_total, total, status
    )
    values (
        v_tenant_id, p_store_id, p_cash_shift_id, auth.uid(), p_customer_id,
        v_subtotal, v_tax_total, v_total, 'completed'
    )
    returning id into v_sale_id;

    -- --- Paso 5: líneas de venta + auditoría de movimiento de stock ---
    for v_item in select * from jsonb_array_elements(p_items)
    loop
        v_product_id := (v_item ->> 'product_id')::uuid;
        v_quantity := (v_item ->> 'quantity')::numeric;
        v_unit_price := (v_item ->> 'unit_price')::numeric;
        v_tax_amount := coalesce((v_item ->> 'tax_amount')::numeric, 0);

        insert into sale_items (sale_id, product_id, quantity, unit_price, tax_amount, subtotal)
        values (v_sale_id, v_product_id, v_quantity, v_unit_price, v_tax_amount, v_unit_price * v_quantity);

        insert into stock_movements (
            tenant_id, product_id, store_id, movement_type, quantity, reference_id, performed_by
        )
        values (v_tenant_id, v_product_id, p_store_id, 'sale', -v_quantity, v_sale_id, auth.uid());
    end loop;

    -- --- Paso 6: pagos ---
    for v_payment in select * from jsonb_array_elements(p_payments)
    loop
        insert into sale_payments (sale_id, method, amount, change_given)
        values (
            v_sale_id,
            v_payment ->> 'method',
            (v_payment ->> 'amount')::numeric,
            coalesce((v_payment ->> 'change_given')::numeric, 0)
        );
    end loop;

    -- --- Paso 7: cargo a crédito del cliente ---
    if v_credit_total > 0 then
        update customers set credit_balance = credit_balance + v_credit_total where id = p_customer_id;
        insert into credit_transactions (customer_id, sale_id, amount, type)
        values (p_customer_id, v_sale_id, v_credit_total, 'charge');
    end if;

    -- --- Paso 8: fidelización (1 punto por cada $10 del total) ---
    if p_customer_id is not null then
        update customers
           set loyalty_points = loyalty_points + floor(v_total / 10)::int
         where id = p_customer_id;
        insert into loyalty_transactions (customer_id, sale_id, points_delta, reason)
        values (p_customer_id, v_sale_id, floor(v_total / 10)::int, 'Compra');
    end if;

    return v_sale_id;
end;
$$;

grant execute on function process_sale(uuid, uuid, uuid, jsonb, jsonb) to authenticated;

-- ============================================================
-- 3. POLÍTICAS RLS PARA LAS TABLAS DEL POS
-- ============================================================
-- (products, sales, users, tenants, roles, stores ya quedaron cubiertas en
-- schema.sql / bootstrap_functions.sql — aquí solo lo que faltaba)

alter table inventory_stock enable row level security;
create policy tenant_isolation_inventory_stock on inventory_stock
    using (tenant_id = auth_tenant_id())
    with check (tenant_id = auth_tenant_id());

alter table stock_movements enable row level security;
create policy tenant_isolation_stock_movements on stock_movements
    using (tenant_id = auth_tenant_id())
    with check (tenant_id = auth_tenant_id());

alter table customers enable row level security;
create policy tenant_isolation_customers on customers
    using (tenant_id = auth_tenant_id())
    with check (tenant_id = auth_tenant_id());

-- sale_items y sale_payments no tienen tenant_id propio (heredan el de la
-- venta), así que la política se resuelve con un EXISTS contra `sales`.
alter table sale_items enable row level security;
create policy tenant_isolation_sale_items on sale_items
    using (exists (
        select 1 from sales s where s.id = sale_items.sale_id and s.tenant_id = auth_tenant_id()
    ));

alter table sale_payments enable row level security;
create policy tenant_isolation_sale_payments on sale_payments
    using (exists (
        select 1 from sales s where s.id = sale_payments.sale_id and s.tenant_id = auth_tenant_id()
    ));

-- cash_registers y cash_shifts tampoco tienen tenant_id directo
alter table cash_registers enable row level security;
create policy tenant_isolation_cash_registers on cash_registers
    using (exists (
        select 1 from stores st where st.id = cash_registers.store_id and st.tenant_id = auth_tenant_id()
    ));

alter table cash_shifts enable row level security;
create policy tenant_isolation_cash_shifts on cash_shifts
    using (exists (
        select 1
          from cash_registers cr
          join stores st on st.id = cr.store_id
         where cr.id = cash_shifts.cash_register_id and st.tenant_id = auth_tenant_id()
    ));

alter table credit_transactions enable row level security;
create policy tenant_isolation_credit_transactions on credit_transactions
    using (exists (
        select 1 from customers c where c.id = credit_transactions.customer_id and c.tenant_id = auth_tenant_id()
    ));

alter table loyalty_transactions enable row level security;
create policy tenant_isolation_loyalty_transactions on loyalty_transactions
    using (exists (
        select 1 from customers c where c.id = loyalty_transactions.customer_id and c.tenant_id = auth_tenant_id()
    ));
