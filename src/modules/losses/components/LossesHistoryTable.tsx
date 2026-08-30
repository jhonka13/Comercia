import { LOSS_CLASSIFICATION_LABELS, LOSS_REASON_LABELS, RECOVERY_STATUS_LABELS } from "@/shared/types/losses";
import type { InventoryLossWithRelations, RecoveryStatus } from "@/shared/types/losses";

interface LossesHistoryTableProps {
  losses: InventoryLossWithRelations[];
  loading?: boolean;
}

const RECOVERY_BADGE_CLASSES: Record<RecoveryStatus, string> = {
  not_applicable: "bg-slate-100 text-slate-500",
  pending: "bg-amber-50 text-amber-600",
  recovered: "bg-emerald-50 text-emerald-600",
  denied: "bg-rose-50 text-rose-600",
};

export function LossesHistoryTable({ losses, loading }: LossesHistoryTableProps) {
  if (loading) return <p className="py-8 text-center text-slate-400">Cargando historial...</p>;

  if (losses.length === 0) {
    return <p className="py-8 text-center text-slate-400">Sin mermas registradas todavía.</p>;
  }

  // El impacto financiero se separa entre lo que ya es pérdida neta (asumida
  // directamente o negada por el proveedor) y lo que todavía está en gestión
  // de reintegro — así esta tabla no exagera el impacto real mostrando como
  // "pérdida" algo que aún puede recuperarse.
  const netLossImpact = losses
    .filter((l) => l.classification === "net_loss" || l.recovery_status === "denied")
    .reduce((sum, l) => sum + l.quantity * l.product.cost_price, 0);
  const pendingImpact = losses
    .filter((l) => l.classification === "supplier_return" && l.recovery_status === "pending")
    .reduce((sum, l) => sum + l.quantity * l.product.cost_price, 0);

  return (
    <div>
      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex items-center justify-between rounded-xl bg-rose-50 px-4 py-3">
          <span className="text-sm font-medium text-rose-700">Pérdida neta acumulada</span>
          <span className="text-lg font-bold text-rose-700">-${netLossImpact.toFixed(2)}</span>
        </div>
        <div className="flex items-center justify-between rounded-xl bg-amber-50 px-4 py-3">
          <span className="text-sm font-medium text-amber-700">Pendiente con proveedores</span>
          <span className="text-lg font-bold text-amber-700">${pendingImpact.toFixed(2)}</span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Producto</th>
              <th className="px-4 py-3 text-right">Cantidad</th>
              <th className="px-4 py-3">Motivo</th>
              <th className="px-4 py-3">Clasificación</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Impacto</th>
              <th className="px-4 py-3">Reportado por</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {losses.map((loss) => (
              <tr key={loss.id} className="hover:bg-slate-50/60">
                <td className="px-4 py-3 text-slate-500">
                  {new Date(loss.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 font-medium text-slate-900">{loss.product.name}</td>
                <td className="px-4 py-3 text-right text-slate-700">{loss.quantity}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                    {LOSS_REASON_LABELS[loss.reason]}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-600">
                  {LOSS_CLASSIFICATION_LABELS[loss.classification]}
                  {loss.supplier && (
                    <p className="text-[11px] text-slate-400">{loss.supplier.name}</p>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={
                      "rounded-full px-2 py-0.5 text-xs font-medium " +
                      RECOVERY_BADGE_CLASSES[loss.recovery_status]
                    }
                  >
                    {RECOVERY_STATUS_LABELS[loss.recovery_status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-rose-600">
                  -${(loss.quantity * loss.product.cost_price).toFixed(2)}
                </td>
                <td className="px-4 py-3 text-slate-500">{loss.reporter.full_name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
