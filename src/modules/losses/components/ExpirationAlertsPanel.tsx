import { AlertTriangle, Clock, PackageX } from "lucide-react";
import { useExpiringBatches } from "@/modules/losses/hooks/useLosses";
import { expirationUrgency } from "@/shared/types/losses";
import type { InventoryBatchWithProduct } from "@/shared/types/losses";

interface ExpirationAlertsPanelProps {
  storeId: string;
  onRegisterLoss: (batch: InventoryBatchWithProduct) => void;
}

const URGENCY_STYLES = {
  critical: "border-rose-200 bg-rose-50 text-rose-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  notice: "border-yellow-200 bg-yellow-50 text-yellow-700",
  ok: "border-slate-200 bg-slate-50 text-slate-600",
} as const;

function daysUntil(dateStr: string) {
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function ExpirationAlertsPanel({ storeId, onRegisterLoss }: ExpirationAlertsPanelProps) {
  const { data: batches, isLoading } = useExpiringBatches(storeId, 30);

  if (isLoading) {
    return <p className="py-8 text-center text-slate-400">Cargando vencimientos...</p>;
  }

  if (!batches || batches.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-slate-300">
        <PackageX className="h-8 w-8" />
        <p className="text-sm">Sin productos por vencer en los próximos 30 días.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {batches.map((batch) => {
        const days = daysUntil(batch.expiration_date as string);
        const urgency = expirationUrgency(days);
        return (
          <div
            key={batch.id}
            className={`flex items-center justify-between rounded-xl border px-4 py-3 ${URGENCY_STYLES[urgency]}`}
          >
            <div className="flex items-center gap-3">
              {urgency === "critical" ? (
                <AlertTriangle className="h-5 w-5 shrink-0" />
              ) : (
                <Clock className="h-5 w-5 shrink-0" />
              )}
              <div>
                <p className="font-medium">{batch.product.name}</p>
                <p className="text-xs opacity-80">
                  {batch.quantity} unidades · Lote {batch.batch_code ?? "sin código"} ·{" "}
                  {days <= 0 ? "Vencido" : `Vence en ${days} día${days === 1 ? "" : "s"}`}
                </p>
              </div>
            </div>
            <button
              onClick={() => onRegisterLoss(batch)}
              className="shrink-0 rounded-lg bg-white/70 px-3 py-1.5 text-xs font-semibold hover:bg-white"
            >
              Registrar merma
            </button>
          </div>
        );
      })}
    </div>
  );
}
