export type LossReason = "damaged" | "expired" | "theft" | "internal_consumption";

export const LOSS_REASON_LABELS: Record<LossReason, string> = {
  damaged: "Producto dañado",
  expired: "Producto vencido",
  theft: "Hurto / pérdida interna",
  internal_consumption: "Consumo interno / muestras",
};

export interface InventoryBatch {
  id: string;
  tenant_id: string;
  product_id: string;
  store_id: string;
  batch_code: string | null;
  quantity: number;
  expiration_date: string | null; // ISO date
  received_at: string;
}

export interface InventoryBatchWithProduct extends InventoryBatch {
  product: { id: string; name: string; sku: string; cost_price: number };
  store: { id: string; name: string };
}

export type LossClassification = "net_loss" | "supplier_return";

export const LOSS_CLASSIFICATION_LABELS: Record<LossClassification, string> = {
  net_loss: "Pérdida neta",
  supplier_return: "Pendiente de reintegro (proveedor)",
};

export type RecoveryStatus = "not_applicable" | "pending" | "recovered" | "denied";

export const RECOVERY_STATUS_LABELS: Record<RecoveryStatus, string> = {
  not_applicable: "No aplica",
  pending: "Pendiente con proveedor",
  recovered: "Recuperado",
  denied: "Proveedor negó garantía",
};

export type RecoveryMethod = "credit_note" | "replacement" | "refund";

export const RECOVERY_METHOD_LABELS: Record<RecoveryMethod, string> = {
  credit_note: "Nota crédito",
  replacement: "Reposición física",
  refund: "Devolución de dinero",
};

export interface InventoryLoss {
  id: string;
  tenant_id: string;
  store_id: string;
  product_id: string;
  quantity: number;
  reason: LossReason;
  batch_id: string | null;
  reported_by: string;
  approved_by: string | null;
  created_at: string;
  classification: LossClassification;
  supplier_id: string | null;
  recovery_status: RecoveryStatus;
}

export interface InventoryLossWithRelations extends InventoryLoss {
  product: { id: string; name: string; sku: string; cost_price: number };
  reporter: { id: string; full_name: string };
  supplier: { id: string; name: string } | null;
}

/** Fila de `list_loss_recoveries` — usada por el panel de gestión y el reporte financiero */
export interface LossRecoveryDetail {
  loss_id: string;
  recovery_id: string;
  product_id: string;
  product_name: string;
  sku: string;
  quantity: number;
  reason: LossReason;
  cost_price: number;
  loss_value: number;
  supplier_id: string;
  supplier_name: string;
  method: RecoveryMethod | null;
  amount: number;
  quantity_replaced: number;
  status: "pending" | "confirmed" | "denied";
  notes: string | null;
  created_at: string;
  resolved_at: string | null;
}

/** Resultado de `get_loss_recovery_report` */
export interface LossRecoveryReport {
  losses_count: number;
  total_loss_value: number;
  net_loss_value: number;
  pending_recovery_value: number;
  recovered_value: number;
  recovery_rate_pct: number;
}

export type AdjustmentStatus = "pending" | "approved" | "rejected";

export interface StockAdjustment {
  id: string;
  tenant_id: string;
  store_id: string;
  product_id: string;
  quantity_delta: number;
  justification: string;
  requested_by: string;
  approved_by: string | null;
  status: AdjustmentStatus;
  created_at: string;
}

export interface StockAdjustmentWithRelations extends StockAdjustment {
  product: { id: string; name: string; sku: string };
  requester: { id: string; full_name: string };
}

/** Umbrales de alerta de vencimiento, en días restantes */
export const EXPIRATION_THRESHOLDS = { critical: 7, warning: 15, notice: 30 } as const;

export function expirationUrgency(daysRemaining: number): "critical" | "warning" | "notice" | "ok" {
  if (daysRemaining <= EXPIRATION_THRESHOLDS.critical) return "critical";
  if (daysRemaining <= EXPIRATION_THRESHOLDS.warning) return "warning";
  if (daysRemaining <= EXPIRATION_THRESHOLDS.notice) return "notice";
  return "ok";
}
