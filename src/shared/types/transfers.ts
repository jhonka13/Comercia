// Tipos alineados 1:1 con database/inventory_transfers_backend.sql
// (tablas stock_transfers / stock_transfer_items, ya definidas en schema.sql)

export interface Store {
  id: string;
  tenant_id: string;
  name: string;
  type: "store" | "warehouse";
  address: string | null;
  is_main: boolean;
}

export type TransferStatus = "pending" | "in_transit" | "received" | "rejected";

export const TRANSFER_STATUS_LABELS: Record<TransferStatus, string> = {
  pending: "Pendiente",
  in_transit: "En tránsito",
  received: "Recibido",
  rejected: "Cancelado",
};

export const TRANSFER_STATUS_COLORS: Record<TransferStatus, string> = {
  pending: "bg-slate-100 text-slate-600",
  in_transit: "bg-amber-100 text-amber-700",
  received: "bg-emerald-100 text-emerald-700",
  rejected: "bg-rose-100 text-rose-700",
};

export interface StockTransfer {
  id: string;
  tenant_id: string;
  origin_store_id: string;
  destination_store_id: string;
  status: TransferStatus;
  requested_by: string;
  dispatched_by: string | null;
  received_by: string | null;
  created_at: string;
  dispatched_at: string | null;
  received_at: string | null;
}

export interface StockTransferItem {
  id: string;
  transfer_id: string;
  product_id: string;
  quantity_requested: number;
  quantity_received: number | null;
}

export interface StockTransferItemWithProduct extends StockTransferItem {
  product: { id: string; name: string; sku: string };
}

export interface StockTransferWithRelations extends StockTransfer {
  origin_store: { id: string; name: string };
  destination_store: { id: string; name: string };
  requester: { id: string; full_name: string };
  items: StockTransferItemWithProduct[];
}

/** Línea del carrito al armar un traslado nuevo, antes de enviarlo */
export interface TransferDraftItem {
  product_id: string;
  product_name: string;
  sku: string;
  quantity: number;
  available_stock: number;
}

/** item_id -> cantidad recibida, usado al confirmar recepción con diferencias */
export type ReceivedQuantities = Record<string, number>;
