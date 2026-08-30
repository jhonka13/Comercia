// Tipos alineados con database/finance_procurement_backend.sql

export interface Supplier {
  id: string;
  tenant_id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  payment_terms_days: number;
}

/** Fila de `get_low_stock_alerts` */
export interface LowStockAlert {
  product_id: string;
  product_name: string;
  sku: string;
  unit_code: string | null;
  current_quantity: number;
  min_quantity: number;
  deficit: number;
  supplier_id: string | null;
  supplier_name: string | null;
}

/** Fila de `get_purchase_suggestions` */
export interface PurchaseSuggestionLine {
  product_id: string;
  product_name: string;
  sku: string;
  unit_code: string | null;
  current_quantity: number;
  min_quantity: number;
  avg_daily_sales: number;
  suggested_quantity: number;
  unit_cost: number;
  estimated_cost: number;
  supplier_id: string | null;
  supplier_name: string | null;
}

/** Agrupación por proveedor, armada en el frontend a partir de PurchaseSuggestionLine[] */
export interface SupplierSuggestionGroup {
  supplierId: string | null; // null = "Sin proveedor asignado"
  supplierName: string;
  lines: PurchaseSuggestionLine[];
  totalEstimatedCost: number;
}

export interface PurchaseOrderItemInput {
  product_id: string;
  quantity: number;
  unit_cost: number;
}

export interface CreatePurchaseOrderParams {
  storeId: string;
  supplierId: string;
  items: PurchaseOrderItemInput[];
  expectedDate?: string | null;
}
