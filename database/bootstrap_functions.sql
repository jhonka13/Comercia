-- ============================================================
-- BOOTSTRAP: creación de tenant + usuario dueño tras el registro
-- Requiere: schema.sql ya aplicado (tablas tenants, users, roles, plans)
-- ============================================================

-- SECURITY DEFINER: corre con privilegios elevados para poder crear el
-- tenant y el registro en `users` en la misma transacción, sin que las
-- políticas RLS (que dependen de que el usuario YA tenga tenant_id) bloqueen
-- su propia creación.
create or replace function create_tenant_and_owner(
    p_business_name text,
    p_full_name text,
    p_owner_role_code text default 'store_admin'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_tenant_id uuid;
    v_role_id uuid;
    v_plan_id uuid;
    v_slug text;
begin
    if auth.uid() is null then
        raise exception 'No hay una sesión autenticada';
    end if;

    if exists (select 1 from users where id = auth.uid()) then
        raise exception 'Este usuario ya pertenece a un tenant';
    end if;

    -- Plan por defecto: el más económico (ajusta según tu catálogo real)
    select id into v_plan_id from plans order by price_monthly asc limit 1;

    v_slug := lower(regexp_replace(p_business_name, '[^a-zA-Z0-9]+', '-', 'g'))
              || '-' || substr(gen_random_uuid()::text, 1, 6);

    insert into tenants (business_name, slug, plan_id, status, trial_ends_at)
    values (p_business_name, v_slug, v_plan_id, 'trial', now() + interval '14 days')
    returning id into v_tenant_id;

    select id into v_role_id from roles where code = p_owner_role_code;
    if v_role_id is null then
        raise exception 'El rol % no existe en el catálogo de roles', p_owner_role_code;
    end if;

    insert into users (id, tenant_id, full_name, email, role_id, active)
    values (auth.uid(), v_tenant_id, p_full_name, auth.email(), v_role_id, true);

    -- Tienda principal por defecto, para que el tenant tenga un store_id
    -- válido desde el primer momento (POS, inventario, etc. lo requieren)
    insert into stores (tenant_id, name, type, is_main)
    values (v_tenant_id, p_business_name, 'store', true);

    return v_tenant_id;
end;
$$;

-- Solo usuarios autenticados pueden ejecutar el bootstrap (nunca anon)
revoke all on function create_tenant_and_owner(text, text, text) from public;
grant execute on function create_tenant_and_owner(text, text, text) to authenticated;

-- ============================================================
-- Políticas RLS necesarias para que el front pueda leer su propio
-- contexto (tenant, rol, tienda) después de login/verify
-- ============================================================

alter table users enable row level security;

-- Un usuario siempre puede leer su propia fila (necesario antes de que
-- auth_tenant_id() tenga algo que resolver en el primer login)
create policy users_self_select on users
    for select
    using (id = auth.uid() or tenant_id = auth_tenant_id());

create policy users_self_update on users
    for update
    using (id = auth.uid());

alter table tenants enable row level security;

create policy tenant_self_select on tenants
    for select
    using (id = auth_tenant_id());

alter table roles enable row level security;
create policy roles_read_all on roles for select using (true);  -- catálogo global, de solo lectura

alter table stores enable row level security;
create policy tenant_isolation_stores on stores
    using (tenant_id = auth_tenant_id())
    with check (tenant_id = auth_tenant_id());
