import { useEffect, useState } from "react";
import {
  ClipboardList,
  LayoutGrid,
  LogOut,
  PackageSearch,
  Receipt,
  ShoppingCart,
  Wallet,
} from "lucide-react";
import AuthLayout from "@/modules/auth/AuthLayout";
import { FinancePage } from "@/modules/finance/pages/FinancePage";
import { ProductCatalogPage } from "@/modules/inventory/pages/ProductCatalogPage";
import { LossesAndAdjustmentsPage } from "@/modules/losses/pages/LossesAndAdjustmentsPage";
import { POSTerminalPage } from "@/modules/pos/pages/POSTerminalPage";
import { ProcurementPage } from "@/modules/procurement/pages/ProcurementPage";
import { TransfersPage } from "@/modules/transfers/pages/TransfersPage";
import { fetchUserContext, type UserContext } from "@/shared/lib/authContext";
import { supabase } from "@/shared/lib/supabaseClient";

type ModuleKey = "pos" | "catalog" | "transfers" | "losses" | "procurement" | "finance";

const NAV_ITEMS: { key: ModuleKey; label: string; icon: typeof LayoutGrid }[] = [
  { key: "pos", label: "Punto de venta", icon: ShoppingCart },
  { key: "catalog", label: "Catálogo", icon: LayoutGrid },
  { key: "transfers", label: "Traslados", icon: PackageSearch },
  { key: "losses", label: "Mermas y ajustes", icon: ClipboardList },
  { key: "procurement", label: "Abastecimiento", icon: Receipt },
  { key: "finance", label: "Finanzas", icon: Wallet },
];

// NOTA: este componente es un shell mínimo de navegación por estado local,
// no un router real (ver "Pendiente de configurar: Router" en README.md).
// Reemplázalo por react-router (o el que prefieras) cuando lo integres;
// mientras tanto, esto deja el proyecto arrancable de punta a punta.
export default function App() {
  const [userContext, setUserContext] = useState<UserContext | null | undefined>(undefined);
  const [activeModule, setActiveModule] = useState<ModuleKey>("pos");

  useEffect(() => {
    const resolveSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setUserContext(null);
        return;
      }
      setUserContext(await fetchUserContext());
    };

    resolveSession();

    const { data: subscription } = supabase.auth.onAuthStateChange(() => {
      resolveSession();
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  // undefined = todavía resolviendo la sesión inicial
  if (userContext === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-400">
        Cargando...
      </div>
    );
  }

  if (userContext === null) {
    return <AuthLayout />;
  }

  const storeId = userContext.store_id;

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="flex w-64 flex-col border-r border-slate-100 bg-white">
        <div className="border-b border-slate-100 px-6 py-5">
          <p className="text-sm font-semibold text-slate-400">{userContext.tenant.business_name}</p>
          <p className="text-xs text-slate-400">{userContext.full_name}</p>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {NAV_ITEMS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveModule(key)}
              className={
                "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition " +
                (activeModule === key
                  ? "bg-emerald-50 text-emerald-700"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-700")
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>

        <button
          onClick={() => supabase.auth.signOut()}
          className="flex items-center gap-3 border-t border-slate-100 px-6 py-4 text-sm text-slate-400 hover:text-rose-500"
        >
          <LogOut className="h-4 w-4" />
          Cerrar sesión
        </button>
      </aside>

      <main className="flex-1 overflow-y-auto">
        {!storeId ? (
          <p className="p-8 text-slate-400">
            Tu usuario no tiene una tienda asignada todavía. Pídele a un administrador que te
            asigne una sucursal.
          </p>
        ) : (
          <>
            {activeModule === "pos" && (
              <POSTerminalPage storeId={storeId} cashierName={userContext.full_name} />
            )}
            {activeModule === "catalog" && <ProductCatalogPage tenantId={userContext.tenant_id} />}
            {activeModule === "transfers" && <TransfersPage storeId={storeId} />}
            {activeModule === "losses" && (
              <LossesAndAdjustmentsPage storeId={storeId} userRoleCode={userContext.role.code} />
            )}
            {activeModule === "procurement" && <ProcurementPage storeId={storeId} />}
            {activeModule === "finance" && <FinancePage storeId={storeId} />}
          </>
        )}
      </main>
    </div>
  );
}
