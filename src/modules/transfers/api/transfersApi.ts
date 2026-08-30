import { supabase } from "@/shared/lib/supabaseClient";
import type { Store, StockTransferWithRelations, TransferStatus } from "@/shared/types/transfers";

const TRANSFER_SELECT =
  "id, tenant_id, origin_store_id, destination_store_id, status, requested_by, dispatched_by, received_by, created_at, dispatched_at, received_at, " +
  "origin_store:stores!stock_transfers_origin_store_id_fkey ( id, name ), " +
  "destination_store:stores!stock_transfers_destination_store_id_fkey ( id, name ), " +
  "requester:users!stock_transfers_requested_by_fkey ( id, full_name ), " +
  "items:stock_transfer_items ( id, transfer_id, product_id, quantity_requested, quantity_received, product:products ( id, name, sku ) )";

// ------------------------- Tiendas -------------------------

export async function listStores() {
  const { data, error } = await supabase.from("stores").select("*").order("name");
  if (error) throw error;
  return data as Store[];
}

// ------------------------- Stock disponible en origen -------------------------

/** Stock actual de un producto en una tienda puntual, usado al armar un traslado nuevo */
export async function getStockAtStore(productId: string, storeId: string) {
  const { data, error } = await supabase
    .from("inventory_stock")
    .select("quantity")
    .eq("product_id", productId)
    .eq("store_id", storeId)
    .maybeSingle();
  if (error) throw error;
  return data?.quantity ?? 0;
}

// ------------------------- Traslados -------------------------

export async function createTransfer(params: {
  originStoreId: string;
  destinationStoreId: string;
  items: { productId: string; quantity: number }[];
}) {
  const { data, error } = await supabase.rpc("create_inventory_transfer", {
    p_origin_store_id: params.originStoreId,
    p_destination_store_id: params.destinationStoreId,
    p_items: params.items.map((i) => ({ product_id: i.productId, quantity: i.quantity })),
  });
  if (error) throw error;
  return data as string;
}

/** Traslados despachados DESDE esta tienda (para la pestaña "Enviados") */
export async function listOutgoingTransfers(storeId: string, limit = 50) {
  const { data, error } = await supabase
    .from("stock_transfers")
    .select(TRANSFER_SELECT)
    .eq("origin_store_id", storeId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data as unknown as StockTransferWithRelations[];
}

/** Traslados con destino a esta tienda, pendientes de confirmar recepción */
export async function listIncomingTransfers(storeId: string) {
  const { data, error } = await supabase
    .from("stock_transfers")
    .select(TRANSFER_SELECT)
    .eq("destination_store_id", storeId)
    .eq("status", "in_transit")
    .order("dispatched_at", { ascending: true });
  if (error) throw error;
  return data as unknown as StockTransferWithRelations[];
}

/** Historial completo de traslados recibidos en esta tienda */
export async function listReceivedTransfers(storeId: string, limit = 50) {
  const { data, error } = await supabase
    .from("stock_transfers")
    .select(TRANSFER_SELECT)
    .eq("destination_store_id", storeId)
    .in("status", ["received", "rejected"])
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data as unknown as StockTransferWithRelations[];
}

export async function receiveTransfer(params: {
  transferId: string;
  items?: { itemId: string; quantityReceived: number }[];
}) {
  const { error } = await supabase.rpc("receive_inventory_transfer", {
    p_transfer_id: params.transferId,
    p_items: params.items
      ? params.items.map((i) => ({ item_id: i.itemId, quantity_received: i.quantityReceived }))
      : null,
  });
  if (error) throw error;
}

export async function cancelTransfer(transferId: string) {
  const { error } = await supabase.rpc("cancel_inventory_transfer", { p_transfer_id: transferId });
  if (error) throw error;
}

export type { TransferStatus };
