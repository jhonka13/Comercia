import { supabase } from "@/shared/lib/supabaseClient";
import type {
  AdjustmentStatus,
  InventoryBatchWithProduct,
  InventoryLossWithRelations,
  LossClassification,
  LossReason,
  LossRecoveryDetail,
  LossRecoveryReport,
  RecoveryMethod,
  StockAdjustmentWithRelations,
} from "@/shared/types/losses";
import type { Supplier } from "@/shared/types/procurement";

// ------------------------- Lotes y vencimientos -------------------------

/** Lotes con stock restante que vencen dentro de `daysAhead` días, ordenados del más urgente al menos urgente (FIFO) */
export async function listExpiringBatches(storeId: string, daysAhead = 30) {
  const limitDate = new Date();
  limitDate.setDate(limitDate.getDate() + daysAhead);

  const { data, error } = await supabase
    .from("inventory_batches")
    .select(
      "id, tenant_id, product_id, store_id, batch_code, quantity, expiration_date, received_at, product:products ( id, name, sku, cost_price ), store:stores ( id, name )"
    )
    .eq("store_id", storeId)
    .gt("quantity", 0)
    .not("expiration_date", "is", null)
    .lte("expiration_date", limitDate.toISOString().slice(0, 10))
    .order("expiration_date", { ascending: true });

  if (error) throw error;
  return data as unknown as InventoryBatchWithProduct[];
}

/** Lotes de un producto en una tienda, en orden PEPS (el más antiguo primero) */
export async function listBatchesForProduct(productId: string, storeId: string) {
  const { data, error } = await supabase
    .from("inventory_batches")
    .select(
      "id, tenant_id, product_id, store_id, batch_code, quantity, expiration_date, received_at, product:products ( id, name, sku, cost_price ), store:stores ( id, name )"
    )
    .eq("product_id", productId)
    .eq("store_id", storeId)
    .gt("quantity", 0)
    .order("expiration_date", { ascending: true, nullsFirst: false })
    .order("received_at", { ascending: true });

  if (error) throw error;
  return data as unknown as InventoryBatchWithProduct[];
}

// ------------------------- Mermas -------------------------

export async function registerLoss(params: {
  storeId: string;
  productId: string;
  quantity: number;
  reason: LossReason;
  batchId?: string | null;
  classification?: LossClassification;
  supplierId?: string | null;
}) {
  const { data, error } = await supabase.rpc("register_inventory_loss", {
    p_store_id: params.storeId,
    p_product_id: params.productId,
    p_quantity: params.quantity,
    p_reason: params.reason,
    p_batch_id: params.batchId ?? null,
    p_classification: params.classification ?? "net_loss",
    p_supplier_id: params.supplierId ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function listLosses(storeId: string, limit = 50) {
  const { data, error } = await supabase
    .from("inventory_losses")
    .select(
      "id, tenant_id, store_id, product_id, quantity, reason, batch_id, reported_by, approved_by, created_at, classification, supplier_id, recovery_status, product:products ( id, name, sku, cost_price ), reporter:users!inventory_losses_reported_by_fkey ( id, full_name ), supplier:suppliers ( id, name )"
    )
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data as unknown as InventoryLossWithRelations[];
}

// ------------------------- Recuperación con proveedor -------------------------

export async function listSuppliers() {
  const { data, error } = await supabase.from("suppliers").select("*").order("name");
  if (error) throw error;
  return data as Supplier[];
}

export async function listPendingRecoveries(storeId: string) {
  const { data, error } = await supabase.rpc("list_loss_recoveries", {
    p_store_id: storeId,
    p_status: "pending",
  });
  if (error) throw error;
  return data as LossRecoveryDetail[];
}

export async function listAllRecoveries(storeId: string) {
  const { data, error } = await supabase.rpc("list_loss_recoveries", {
    p_store_id: storeId,
    p_status: null,
  });
  if (error) throw error;
  return data as LossRecoveryDetail[];
}

export async function resolveLossRecovery(params: {
  lossId: string;
  status: "confirmed" | "denied";
  method?: RecoveryMethod | null;
  amount?: number;
  quantityReplaced?: number;
  notes?: string | null;
}) {
  const { error } = await supabase.rpc("resolve_loss_recovery", {
    p_loss_id: params.lossId,
    p_status: params.status,
    p_method: params.method ?? null,
    p_amount: params.amount ?? 0,
    p_quantity_replaced: params.quantityReplaced ?? 0,
    p_notes: params.notes ?? null,
  });
  if (error) throw error;
}

export async function getFinancialRecoveryReport(
  storeId: string,
  dateFrom?: string | null,
  dateTo?: string | null
) {
  const { data, error } = await supabase.rpc("get_loss_recovery_report", {
    p_store_id: storeId,
    p_date_from: dateFrom ?? null,
    p_date_to: dateTo ?? null,
  });
  if (error) throw error;
  return (data as LossRecoveryReport[])[0];
}

// ------------------------- Ajustes de stock -------------------------

export async function requestAdjustment(params: {
  storeId: string;
  productId: string;
  quantityDelta: number;
  justification: string;
}) {
  const { data, error } = await supabase.rpc("request_stock_adjustment", {
    p_store_id: params.storeId,
    p_product_id: params.productId,
    p_quantity_delta: params.quantityDelta,
    p_justification: params.justification,
  });
  if (error) throw error;
  return data as string;
}

export async function listAdjustments(storeId: string, status?: AdjustmentStatus) {
  let query = supabase
    .from("stock_adjustments")
    .select(
      "id, tenant_id, store_id, product_id, quantity_delta, justification, requested_by, approved_by, status, created_at, product:products ( id, name, sku ), requester:users!stock_adjustments_requested_by_fkey ( id, full_name )"
    )
    .eq("store_id", storeId)
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) throw error;
  return data as unknown as StockAdjustmentWithRelations[];
}

export async function approveAdjustment(adjustmentId: string) {
  const { error } = await supabase.rpc("approve_stock_adjustment", {
    p_adjustment_id: adjustmentId,
  });
  if (error) throw error;
}

export async function rejectAdjustment(adjustmentId: string) {
  const { error } = await supabase.rpc("reject_stock_adjustment", {
    p_adjustment_id: adjustmentId,
  });
  if (error) throw error;
}
