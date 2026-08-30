import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/modules/pos/api/posApi";
import type { ProcessSaleParams } from "@/shared/types/pos";

export function useCashRegisters(storeId: string) {
  return useQuery({
    queryKey: ["cash-registers", storeId],
    queryFn: () => api.listCashRegisters(storeId),
  });
}

export function useStoreStock(storeId: string) {
  return useQuery({
    queryKey: ["store-stock", storeId],
    queryFn: () => api.getStockMapForStore(storeId),
    refetchOnWindowFocus: true,
  });
}

export function useReceiptContext(storeId: string) {
  return useQuery({
    queryKey: ["receipt-context", storeId],
    queryFn: () => api.getReceiptContext(storeId),
    staleTime: 1000 * 60 * 30, // no cambia durante la sesión de POS
  });
}

export function useOpenShift(cashRegisterId: string | null) {
  return useQuery({
    queryKey: ["open-shift", cashRegisterId],
    queryFn: () => api.getOpenShift(cashRegisterId as string),
    enabled: !!cashRegisterId,
  });
}

export function useOpenShiftMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ cashRegisterId, openingAmount }: { cashRegisterId: string; openingAmount: number }) =>
      api.openShift(cashRegisterId, openingAmount),
    onSuccess: (_data, { cashRegisterId }) =>
      qc.invalidateQueries({ queryKey: ["open-shift", cashRegisterId] }),
  });
}

export function useCloseShiftMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ shiftId, closingAmount }: { shiftId: string; closingAmount: number }) =>
      api.closeShift(shiftId, closingAmount),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["open-shift"] }),
  });
}

export function useProcessSale(storeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: ProcessSaleParams) => api.processSale(params),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["store-stock", storeId] }),
  });
}
