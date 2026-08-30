import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/modules/losses/api/lossesApi";
import type { AdjustmentStatus, LossClassification, LossReason, RecoveryMethod } from "@/shared/types/losses";

export function useExpiringBatches(storeId: string, daysAhead = 30) {
  return useQuery({
    queryKey: ["expiring-batches", storeId, daysAhead],
    queryFn: () => api.listExpiringBatches(storeId, daysAhead),
  });
}

export function useBatchesForProduct(productId: string | null, storeId: string) {
  return useQuery({
    queryKey: ["batches-for-product", productId, storeId],
    queryFn: () => api.listBatchesForProduct(productId as string, storeId),
    enabled: !!productId,
  });
}

export function useRegisterLoss(storeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      productId: string;
      quantity: number;
      reason: LossReason;
      batchId?: string | null;
      classification?: LossClassification;
      supplierId?: string | null;
    }) => api.registerLoss({ storeId, ...params }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["losses", storeId] });
      qc.invalidateQueries({ queryKey: ["expiring-batches", storeId] });
      qc.invalidateQueries({ queryKey: ["store-stock", storeId] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["pending-recoveries", storeId] });
      qc.invalidateQueries({ queryKey: ["recovery-report", storeId] });
    },
  });
}

export function useLosses(storeId: string) {
  return useQuery({
    queryKey: ["losses", storeId],
    queryFn: () => api.listLosses(storeId),
  });
}

export function useSuppliers() {
  return useQuery({ queryKey: ["suppliers"], queryFn: api.listSuppliers });
}

export function usePendingRecoveries(storeId: string) {
  return useQuery({
    queryKey: ["pending-recoveries", storeId],
    queryFn: () => api.listPendingRecoveries(storeId),
  });
}

export function useAllRecoveries(storeId: string) {
  return useQuery({
    queryKey: ["all-recoveries", storeId],
    queryFn: () => api.listAllRecoveries(storeId),
  });
}

export function useResolveLossRecovery(storeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      lossId: string;
      status: "confirmed" | "denied";
      method?: RecoveryMethod | null;
      amount?: number;
      quantityReplaced?: number;
      notes?: string | null;
    }) => api.resolveLossRecovery(params),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pending-recoveries", storeId] });
      qc.invalidateQueries({ queryKey: ["all-recoveries", storeId] });
      qc.invalidateQueries({ queryKey: ["losses", storeId] });
      qc.invalidateQueries({ queryKey: ["recovery-report", storeId] });
    },
  });
}

export function useFinancialRecoveryReport(
  storeId: string,
  dateFrom?: string | null,
  dateTo?: string | null
) {
  return useQuery({
    queryKey: ["recovery-report", storeId, dateFrom, dateTo],
    queryFn: () => api.getFinancialRecoveryReport(storeId, dateFrom, dateTo),
  });
}

export function useRequestAdjustment(storeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { productId: string; quantityDelta: number; justification: string }) =>
      api.requestAdjustment({ storeId, ...params }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["adjustments", storeId] }),
  });
}

export function useAdjustments(storeId: string, status?: AdjustmentStatus) {
  return useQuery({
    queryKey: ["adjustments", storeId, status],
    queryFn: () => api.listAdjustments(storeId, status),
  });
}

export function useApproveAdjustment(storeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (adjustmentId: string) => api.approveAdjustment(adjustmentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["adjustments", storeId] });
      qc.invalidateQueries({ queryKey: ["store-stock", storeId] });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

export function useRejectAdjustment(storeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (adjustmentId: string) => api.rejectAdjustment(adjustmentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["adjustments", storeId] }),
  });
}
