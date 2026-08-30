import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/modules/procurement/api/procurementApi";
import type { CreatePurchaseOrderParams } from "@/shared/types/procurement";

/**
 * Refresca cada 60s: son las alertas que alimentan el panel de notificaciones
 * del dashboard, y el stock cambia constantemente por las ventas en curso en
 * el POS. `refetchOnWindowFocus` cubre además el caso típico de dejar el
 * dashboard abierto en una pantalla secundaria.
 */
export function useLowStockAlerts(storeId: string) {
  return useQuery({
    queryKey: ["low-stock-alerts", storeId],
    queryFn: () => api.listLowStockAlerts(storeId),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function usePurchaseSuggestions(storeId: string, coverageDays = 14) {
  return useQuery({
    queryKey: ["purchase-suggestions", storeId, coverageDays],
    queryFn: () => api.listPurchaseSuggestions(storeId, coverageDays),
  });
}

export function useCreatePurchaseOrder(storeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: CreatePurchaseOrderParams) => api.createPurchaseOrder(params),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["low-stock-alerts", storeId] });
      qc.invalidateQueries({ queryKey: ["purchase-suggestions", storeId] });
    },
  });
}
