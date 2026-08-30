import { AlertTriangle, Bell } from "lucide-react";
import { useLowStockAlerts } from "@/modules/procurement/hooks/useProcurement";

interface LowStockAlertsPanelProps {
  storeId: string;
  /** navega a la vista completa de abastecimiento (pestaña Sugerencias) */
  onViewAll?: () => void;
}

/**
 * Pensado para vivir en el dashboard del administrador. Se refresca solo
 * (ver useLowStockAlerts) para que la campana de notificaciones se sienta
 * "en tiempo real" sin necesitar websockets — en un negocio de una sola
 * caja el polling cada 60s es más que suficiente y evita depender de
 * Supabase Realtime solo para esto.
 */
export function LowStockAlertsPanel({ storeId, onViewAll }: LowStockAlertsPanelProps) {
  const { data: alerts, isLoading } = useLowStockAlerts(storeId);

  const criticalCount = (alerts ?? []).filter((a) => a.current_quantity <= 0).length;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-bold text-slate-900">
          <Bell className="h-5 w-5 text-amber-500" />
          Alertas de inventario
        </h3>
        {alerts && alerts.length > 0 && (
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
            {alerts.length}
          </span>
        )}
      </div>

      {isLoading && <p className="py-6 text-center text-sm text-slate-400">Cargando...</p>}

      {!isLoading && (!alerts || alerts.length === 0) && (
        <p className="py-6 text-center text-sm text-slate-300">
          Todo el inventario está por encima del mínimo configurado.
        </p>
      )}

      {!isLoading && alerts && alerts.length > 0 && (
        <>
          {criticalCount > 0 && (
            <p className="mb-3 flex items-center gap-1.5 text-xs font-medium text-rose-600">
              <AlertTriangle className="h-3.5 w-3.5" />
              {criticalCount} producto(s) agotado(s)
            </p>
          )}
          <ul className="max-h-72 space-y-2 overflow-y-auto">
            {alerts.slice(0, 8).map((alert) => (
              <li
                key={alert.product_id}
                className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium text-slate-800">{alert.product_name}</p>
                  <p className="text-xs text-slate-400">{alert.sku}</p>
                </div>
                <div className="text-right">
                  <p
                    className={
                      "font-semibold " + (alert.current_quantity <= 0 ? "text-rose-600" : "text-amber-600")
                    }
                  >
                    {alert.current_quantity} / {alert.min_quantity} {alert.unit_code ?? ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          {onViewAll && (
            <button
              onClick={onViewAll}
              className="mt-3 w-full rounded-lg border border-slate-200 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Ver sugerencias de compra →
            </button>
          )}
        </>
      )}
    </div>
  );
}
