import { Check, Clock, X as XIcon } from "lucide-react";
import { useAdjustments, useApproveAdjustment, useRejectAdjustment } from "@/modules/losses/hooks/useLosses";
import type { StockAdjustmentWithRelations } from "@/shared/types/losses";

interface AdjustmentsPanelProps {
  storeId: string;
  /** true si el rol del usuario actual puede aprobar/rechazar (supervisor, store_admin, superadmin) */
  canApprove: boolean;
}

const STATUS_STYLES = {
  pending: "bg-amber-50 text-amber-700",
  approved: "bg-emerald-50 text-emerald-700",
  rejected: "bg-rose-50 text-rose-700",
} as const;

const STATUS_LABELS = {
  pending: "Pendiente",
  approved: "Aprobado",
  rejected: "Rechazado",
} as const;

export function AdjustmentsPanel({ storeId, canApprove }: AdjustmentsPanelProps) {
  const { data: adjustments, isLoading } = useAdjustments(storeId);
  const approve = useApproveAdjustment(storeId);
  const reject = useRejectAdjustment(storeId);

  if (isLoading) return <p className="py-8 text-center text-slate-400">Cargando ajustes...</p>;

  if (!adjustments || adjustments.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-slate-300">
        <Clock className="h-8 w-8" />
        <p className="text-sm">No hay ajustes de stock solicitados todavía.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {adjustments.map((adj: StockAdjustmentWithRelations) => (
        <div key={adj.id} className="rounded-xl border border-slate-200 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <p className="font-medium text-slate-900">{adj.product.name}</p>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[adj.status]}`}
                >
                  {STATUS_LABELS[adj.status]}
                </span>
              </div>
              <p
                className={
                  "mt-0.5 text-sm font-semibold " +
                  (adj.quantity_delta > 0 ? "text-emerald-600" : "text-rose-500")
                }
              >
                {adj.quantity_delta > 0 ? "+" : ""}
                {adj.quantity_delta} unidades
              </p>
              <p className="mt-1 text-sm text-slate-500">{adj.justification}</p>
              <p className="mt-1 text-xs text-slate-400">
                Solicitado por {adj.requester.full_name} ·{" "}
                {new Date(adj.created_at).toLocaleString()}
              </p>
            </div>

            {adj.status === "pending" && canApprove && (
              <div className="flex shrink-0 gap-1">
                <button
                  onClick={() => approve.mutate(adj.id)}
                  disabled={approve.isPending || reject.isPending}
                  className="rounded-lg bg-emerald-100 p-2 text-emerald-700 hover:bg-emerald-200 disabled:opacity-50"
                  aria-label="Aprobar"
                >
                  <Check className="h-4 w-4" />
                </button>
                <button
                  onClick={() => reject.mutate(adj.id)}
                  disabled={approve.isPending || reject.isPending}
                  className="rounded-lg bg-rose-100 p-2 text-rose-700 hover:bg-rose-200 disabled:opacity-50"
                  aria-label="Rechazar"
                >
                  <XIcon className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
