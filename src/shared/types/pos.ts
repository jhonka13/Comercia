export type PaymentMethod = "cash" | "card" | "transfer" | "credit";

/**
 * Códigos de unidad que se venden fraccionadas (peso/volumen a granel) —
 * usados para decidir el "step" del input de cantidad en la grilla del POS y
 * el formato con el que se imprime en el ticket. Cualquier código que no
 * esté en esta lista (unidad, caja, paquete...) se trata como discreto.
 */
export const FRACTIONAL_UNIT_CODES = new Set(["kg", "g", "lb", "lt", "l", "ml"]);

export function isFractionalUnit(unitCode: string | null | undefined) {
  return !!unitCode && FRACTIONAL_UNIT_CODES.has(unitCode.toLowerCase());
}

/** Cuántos decimales mostrar/permitir según la unidad — gramos y mililitros con más precisión que kilos/litros */
export function quantityDecimals(unitCode: string | null | undefined) {
  const code = unitCode?.toLowerCase();
  if (code === "g" || code === "ml") return 0;
  if (isFractionalUnit(code)) return 3;
  return 0;
}

export interface CartLine {
  productId: string;
  name: string;
  sku: string;
  unitPrice: number;
  taxRate: number; // porcentaje, ej. 19 = 19%
  quantity: number;
  /** stock disponible al momento de agregarlo, para no dejar cargar de más en el carrito */
  availableStock: number;
  /** código de unidad de medida (kg, lt, unidad...) — determina si la cantidad admite decimales */
  unitCode: string | null;
}

export interface CartTotals {
  grossSubtotal: number; // suma de unitPrice * quantity, sin descuento
  discountAmount: number;
  subtotal: number; // grossSubtotal - discountAmount
  taxTotal: number;
  total: number;
}

export interface SalePaymentInput {
  method: PaymentMethod;
  amount: number;
  change_given: number;
}

export interface CustomerSummary {
  id: string;
  full_name: string;
  document_id: string | null;
  phone: string | null;
  credit_limit: number;
  credit_balance: number;
  loyalty_points: number;
}

export interface CashShift {
  id: string;
  cash_register_id: string;
  cashier_id: string;
  opening_amount: number;
  closing_amount: number | null;
  expected_amount: number | null;
  status: "open" | "closed";
  opened_at: string;
  closed_at: string | null;
}

export interface CashRegister {
  id: string;
  store_id: string;
  name: string;
}

export interface ProcessSaleParams {
  storeId: string;
  cashShiftId: string | null;
  customerId: string | null;
  lines: CartLine[];
  discountPercent: number;
  payments: SalePaymentInput[];
}

/** Encabezado del negocio/tienda para el ticket térmico — resuelto una vez por sesión de POS */
export interface ReceiptContext {
  businessName: string;
  storeName: string;
  storeAddress: string | null;
}

/** Todo lo que necesita ThermalReceipt para imprimirse — se arma justo después de una venta exitosa */
export interface ReceiptData {
  saleId: string;
  createdAt: string;
  context: ReceiptContext;
  cashierName: string;
  customerName: string | null;
  lines: CartLine[];
  discountPercent: number;
  totals: CartTotals;
  payments: SalePaymentInput[];
}
