import { useState } from "react";
import { HandCoins, PiggyBank, TrendingDown, TrendingUp } from "lucide-react";
import { useAllRecoveries, useFinancialRecoveryReport } from "@/modules/losses/hooks/useLosses";
import { RECOVERY_METHOD_LABELS } from "@/shared/types/losses";

interface LossRecoveryReportProps {
  storeId: string;
}

/**
 * Métricas + detalle del ciclo "merma → gestión con proveedor → recuperación".
 * El filtro de fechas es opcional (por defecto muestra todo el histórico de
 * la tienda) para que sirva tanto de vista rápida como de reporte de cierre
 * de mes.
 */
export function LossRecoveryReport({ storeId }: LossRecoveryReportProps) {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: report, isLoading } = useFinancialRecoveryReport(
    storeId,
    dateFrom || null,
    dateTo || null
  );
  const { data: recoveries } = useAllRecoveries(storeId);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">Desde</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-emerald-400"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">Hasta</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-emerald-400"
          />
        </div>
      </div>

      {isLoading && <p className="py-8 text-center text-slate-400">Calculando reporte...</p>}

      {report && (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              icon={<TrendingDown className="h-5 w-5 text-rose-500" />}
              label="Pérdida neta"
              value={`$${report.net_loss_value.toFixed(2)}`}
              tone="rose"
            />
            <MetricCard
              icon={<HandCoins className="h-5 w-5 text-amber-500" />}
              label="Pendiente con proveedores"
              value={`$${report.pending_recovery_value.toFixed(2)}`}
              tone="amber"
            />
            <MetricCard
              icon={<PiggyBank className="h-5 w-5 text-emerald-500" />}
              label="Recuperado"
              value={`$${report.recovered_value.toFixed(2)}`}
              tone="emerald"
            />
            <MetricCard
              icon={<TrendingUp className="h-5 w-5 text-slate-500" />}
              label="Tasa de recuperación"
              value={`${report.recovery_rate_pct}%`}
              tone="slate"
            />
          </div>

          <p className="mb-4 text-xs text-slate-400">
            {report.losses_count} merma(s) registradas · impacto bruto total $
            {report.total_loss_value.toFixed(2)}
          </p>
        </>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Producto</th>
              <th className="px-4 py-3">Proveedor</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Método</th>
              <th className="px-4 py-3 text-right">Impacto</th>
              <th className="px-4 py-3 text-right">Recuperado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(recoveries ?? []).map((r) => (
              <tr key={r.loss_id} className="hover:bg-slate-50/60">
                <td className="px-4 py-3 text-slate-500">
                  {new Date(r.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 font-medium text-slate-900">{r.product_name}</td>
                <td className="px-4 py-3 text-slate-600">{r.supplier_name}</td>
                <td className="px-4 py-3">
                  <span
                    className={
                      "rounded-full px-2 py-0.5 text-xs font-medium " +
                      (r.status === "confirmed"
                        ? "bg-emerald-50 text-emerald-600"
                        : r.status === "denied"
                          ? "bg-rose-50 text-rose-600"
                          : "bg-amber-50 text-amber-600")
                    }
                  >
                    {r.status === "confirmed" ? "Recuperado" : r.status === "denied" ? "Negado" : "Pendiente"}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {r.method ? RECOVERY_METHOD_LABELS[r.method] : "—"}
                </td>
                <td className="px-4 py-3 text-right text-rose-600">-${r.loss_value.toFixed(2)}</td>
                <td className="px-4 py-3 text-right text-emerald-600">
                  {r.status === "confirmed"
                    ? `$${(r.amount + r.quantity_replaced * r.cost_price).toFixed(2)}`
                    : "—"}
                </td>
              </tr>
            ))}
            {(!recoveries || recoveries.length === 0) && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-300">
                  No hay mermas gestionadas con proveedores todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "rose" | "amber" | "emerald" | "slate";
}) {
  const toneClasses: Record<typeof tone, string> = {
    rose: "bg-rose-50",
    amber: "bg-amber-50",
    emerald: "bg-emerald-50",
    slate: "bg-slate-100",
  };
  return (
    <div className={`rounded-2xl p-4 ${toneClasses[tone]}`}>
      <div className="mb-2">{icon}</div>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="text-xl font-bold text-slate-900">{value}</p>
    </div>
  );
}
