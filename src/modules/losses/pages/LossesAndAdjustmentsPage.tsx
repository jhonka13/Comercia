import { useState } from "react";
import { AlertTriangle, ClipboardList, HandCoins, PackageMinus, Plus } from "lucide-react";
import { ExpirationAlertsPanel } from "@/modules/losses/components/ExpirationAlertsPanel";
import { RegisterLossModal } from "@/modules/losses/components/RegisterLossModal";
import { LossesHistoryTable } from "@/modules/losses/components/LossesHistoryTable";
import { RequestAdjustmentModal } from "@/modules/losses/components/RequestAdjustmentModal";
import { AdjustmentsPanel } from "@/modules/losses/components/AdjustmentsPanel";
import { RecoveryManagementPanel } from "@/modules/losses/components/RecoveryManagementPanel";
import { useLosses } from "@/modules/losses/hooks/useLosses";
import type { InventoryBatchWithProduct } from "@/shared/types/losses";

interface LossesAndAdjustmentsPageProps {
  storeId: string;
  /** rol del usuario autenticado (viene de authContext.ts → UserContext.role.code) */
  userRoleCode: string;
}

type Tab = "expirations" | "losses" | "recovery" | "adjustments";

export function LossesAndAdjustmentsPage({ storeId, userRoleCode }: LossesAndAdjustmentsPageProps) {
  const [tab, setTab] = useState<Tab>("expirations");
  const [lossModalBatch, setLossModalBatch] = useState<InventoryBatchWithProduct | null>(null);
  const [showLossModal, setShowLossModal] = useState(false);
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);

  const { data: losses, isLoading: loadingLosses } = useLosses(storeId);
  const canApprove = ["supervisor", "store_admin", "superadmin"].includes(userRoleCode);

  const tabs: { id: Tab; label: string; icon: typeof AlertTriangle }[] = [
    { id: "expirations", label: "Vencimientos", icon: AlertTriangle },
    { id: "losses", label: "Mermas", icon: PackageMinus },
    { id: "recovery", label: "Recuperación", icon: HandCoins },
    { id: "adjustments", label: "Ajustes", icon: ClipboardList },
  ];

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Mermas, vencimientos y ajustes</h1>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setLossModalBatch(null);
              setShowLossModal(true);
            }}
            className="flex items-center gap-2 rounded-xl bg-rose-500 px-4 py-2.5 font-semibold text-white hover:bg-rose-600"
          >
            <Plus className="h-4 w-4" />
            Registrar merma
          </button>
          <button
            onClick={() => setShowAdjustmentModal(true)}
            className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Plus className="h-4 w-4" />
            Solicitar ajuste
          </button>
        </div>
      </div>

      <div className="mb-6 flex gap-1 rounded-xl bg-slate-100 p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={
              "flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition " +
              (tab === t.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")
            }
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "expirations" && (
        <ExpirationAlertsPanel
          storeId={storeId}
          onRegisterLoss={(batch) => {
            setLossModalBatch(batch);
            setShowLossModal(true);
          }}
        />
      )}

      {tab === "losses" && <LossesHistoryTable losses={losses ?? []} loading={loadingLosses} />}

      {tab === "recovery" && <RecoveryManagementPanel storeId={storeId} canResolve={canApprove} />}

      {tab === "adjustments" && <AdjustmentsPanel storeId={storeId} canApprove={canApprove} />}

      {showLossModal && (
        <RegisterLossModal
          storeId={storeId}
          prefillBatch={lossModalBatch}
          onClose={() => {
            setShowLossModal(false);
            setLossModalBatch(null);
          }}
        />
      )}

      {showAdjustmentModal && (
        <RequestAdjustmentModal storeId={storeId} onClose={() => setShowAdjustmentModal(false)} />
      )}
    </div>
  );
}
