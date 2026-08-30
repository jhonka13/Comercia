import { supabase } from "@/shared/lib/supabaseClient";
import type {
  CreatePurchaseOrderParams,
  LowStockAlert,
  PurchaseSuggestionLine,
} from "@/shared/types/procurement";

export async function listLowStockAlerts(storeId: string) {
  const { data, error } = await supabase.rpc("get_low_stock_alerts", {
    p_store_id: storeId,
  });
  if (error) throw error;
  return data as LowStockAlert[];
}

export async function listPurchaseSuggestions(
  storeId: string,
  coverageDays = 14,
  lookbackDays = 30
) {
  const { data, error } = await supabase.rpc("get_purchase_suggestions", {
    p_store_id: storeId,
    p_coverage_days: coverageDays,
    p_lookback_days: lookbackDays,
  });
  if (error) throw error;
  return data as PurchaseSuggestionLine[];
}

export async function createPurchaseOrder(params: CreatePurchaseOrderParams) {
  const { data, error } = await supabase.rpc("create_purchase_order", {
    p_store_id: params.storeId,
    p_supplier_id: params.supplierId,
    p_items: params.items.map((i) => ({
      product_id: i.product_id,
      quantity: i.quantity,
      unit_cost: i.unit_cost,
    })),
    p_expected_date: params.expectedDate ?? null,
  });
  if (error) throw error;
  return data as string; // purchase_order id
}
