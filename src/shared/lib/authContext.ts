import { supabase } from "./supabaseClient";

export interface UserContext {
  id: string;
  tenant_id: string;
  full_name: string;
  store_id: string | null;
  role: {
    code: string; // 'superadmin' | 'store_admin' | 'cashier' | 'inventory_admin' | 'supervisor'
    name: string;
  };
  tenant: {
    business_name: string;
    status: string; // 'trial' | 'active' | 'past_due' | 'suspended' | 'cancelled'
  };
}

/**
 * Resuelve a qué tenant, rol y tienda pertenece el usuario autenticado.
 * Debe llamarse después de un login o verificación exitosos, con sesión activa.
 * Depende de las políticas RLS `users_self_select` y `tenant_self_select`
 * definidas en bootstrap_functions.sql.
 */
export async function fetchUserContext(): Promise<UserContext | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from("users")
    .select(
      `
      id,
      tenant_id,
      full_name,
      store_id,
      role:roles ( code, name ),
      tenant:tenants ( business_name, status )
    `
    )
    .eq("id", user.id)
    .single();

  if (error) {
    // El registro en `users` puede no existir aún si la verificación de
    // cuenta (creación de tenant) no se ha completado.
    console.error("No se pudo resolver el contexto de usuario:", error.message);
    return null;
  }

  return data as unknown as UserContext;
}

/** Redirige según el rol resuelto. Ajusta las rutas a tu router real. */
export function redirectByRole(context: UserContext) {
  if (context.tenant.status === "suspended" || context.tenant.status === "cancelled") {
    window.location.href = "/suscripcion-suspendida";
    return;
  }
  if (context.role.code === "superadmin") {
    window.location.href = "/admin";
    return;
  }
  window.location.href = "/panel";
}
