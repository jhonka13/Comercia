import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/modules/transfers/api/transfersApi";

export function useStores() {
  return useQuery({ queryKey: ["stores"], queryFn: api.listStores });
}

export function useStockAtStore(productId: string | null, storeId: string | null) {
  return useQuery({
    queryKey: ["stock-at-store", productId, storeId],
    queryFn: () => api.getStockAtStore(productId as string, storeId as string),
    enabled: !!productId && !!storeId,
  });
}

function invalidateAfterTransferChange(qc: ReturnType<typeof useQueryClient>, storeIds: (string | undefined)[]) {
  qc.invalidateQueries({ queryKey: ["outgoing-transfers"] });
  qc.invalidateQueries({ queryKey: ["incoming-transfers"] });
  qc.invalidateQueries({ queryKey: ["received-transfers"] });
  qc.invalidateQueries({ queryKey: ["products"] });
  for (const storeId of storeIds) {
    if (storeId) qc.invalidateQueries({ queryKey: ["stock-at-store", undefined, storeId] });
  }
}

export function useCreateTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      originStoreId: string;
      destinationStoreId: string;
      items: { productId: string; quantity: number }[];
    }) => api.createTransfer(params),
    onSuccess: (_data, variables) =>
      invalidateAfterTransferChange(qc, [variables.originStoreId, variables.destinationStoreId]),
  });
}

export function useOutgoingTransfers(storeId: string) {
  return useQuery({
    queryKey: ["outgoing-transfers", storeId],
    queryFn: () => api.listOutgoingTransfers(storeId),
    enabled: !!storeId,
  });
}

export function useIncomingTransfers(storeId: string) {
  return useQuery({
    queryKey: ["incoming-transfers", storeId],
    queryFn: () => api.listIncomingTransfers(storeId),
    enabled: !!storeId,
    refetchInterval: 30_000, // los traslados pueden llegar desde otra sucursal en cualquier momento
  });
}

export function useReceivedTransfers(storeId: string) {
  return useQuery({
    queryKey: ["received-transfers", storeId],
    queryFn: () => api.listReceivedTransfers(storeId),
    enabled: !!storeId,
  });
}

export function useReceiveTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { transferId: string; items?: { itemId: string; quantityReceived: number }[] }) =>
      api.receiveTransfer(params),
    onSuccess: () => invalidateAfterTransferChange(qc, []),
  });
}

export function useCancelTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (transferId: string) => api.cancelTransfer(transferId),
    onSuccess: () => invalidateAfterTransferChange(qc, []),
  });
}
