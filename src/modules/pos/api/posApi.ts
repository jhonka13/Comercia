import { supabase } from "@/shared/lib/supabaseClient";
import type {
  CashRegister,
  CashShift,
  CustomerSummary,
  ProcessSaleParams,
  ReceiptContext,
} from "@/shared/types/pos";
import { discountedUnitPrice } from "@/modules/pos/lib/cartMath";

// ------------------------- Caja -------------------------

export async function listCashRegisters(storeId: string) {
  const { data, error } = await supabase
    .from("cash_registers")
    .select("id, store_id, name")
    .eq("store_id", storeId)
    .order("name");
  if (error) throw error;
  return data as CashRegister[];
}

export async function getOpenShift(cashRegisterId: string) {
  const { data, error } = await supabase
    .from("cash_shifts")
    .select("*")
    .eq("cash_register_id", cashRegisterId)
    .eq("status", "open")
    .maybeSingle();
  if (error) throw error;
  return data as CashShift | null;
}

export async function openShift(cashRegisterId: string, openingAmount: number) {
  const { data, error } = await supabase.rpc("open_cash_shift", {
    p_cash_register_id: cashRegisterId,
    p_opening_amount: openingAmount,
  });
  if (error) throw error;
  return data as string; // shift id
}

export async function closeShift(shiftId: string, closingAmount: number) {
  const { data, error } = await supabase.rpc("close_cash_shift", {
    p_shift_id: shiftId,
    p_closing_amount: closingAmount,
  });
  if (error) throw error;
  return data as { expected_amount: number; difference: number }[];
}

// ------------------------- Clientes -------------------------

export async function searchCustomers(query: string): Promise<CustomerSummary[]> {
  if (!query.trim()) return [];
  const { data, error } = await supabase
    .from("customers")
    .select("id, full_name, document_id, phone, credit_limit, credit_balance, loyalty_points")
    .or(`full_name.ilike.%${query}%,document_id.ilike.%${query}%,phone.ilike.%${query}%`)
    .limit(8);
  if (error) throw error;
  return data as CustomerSummary[];
}

// ------------------------- Stock (para el panel de venta) -------------------------

/** Mapa productId -> cantidad disponible en la tienda actual, para validar en el carrito sin una query por producto */
export async function getStockMapForStore(storeId: string): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from("inventory_stock")
    .select("product_id, quantity")
    .eq("store_id", storeId);
  if (error) throw error;
  const map: Record<string, number> = {};
  for (const row of data ?? []) map[row.product_id] = row.quantity;
  return map;
}

// ------------------------- Ticket térmico -------------------------

/** Encabezado del negocio/tienda para imprimir en el ticket — se resuelve una vez por sesión de POS */
export async function getReceiptContext(storeId: string): Promise<ReceiptContext> {
  const { data, error } = await supabase
    .from("stores")
    .select("name, address, tenant:tenants ( business_name )")
    .eq("id", storeId)
    .single();
  if (error) throw error;

  const row = data as unknown as {
    name: string;
    address: string | null;
    tenant: { business_name: string } | null;
  };

  return {
    businessName: row.tenant?.business_name ?? "",
    storeName: row.name,
    storeAddress: row.address,
  };
}

// ------------------------- Venta -------------------------

/**
 * Arma el payload para `process_sale` y lo ejecuta. El servidor recalcula
 * subtotal/impuestos/total a partir de estas mismas líneas — el precio con
 * descuento se aplica ANTES de enviarlo, así el servidor no necesita saber
 * nada sobre el concepto de "descuento", solo recibe precios finales.
 */
export async function processSale(params: ProcessSaleParams) {
  const items = params.lines.map((line) => {
    const unitPrice = discountedUnitPrice(line.unitPrice, params.discountPercent);
    const taxAmount = Math.round(unitPrice * line.quantity * (line.taxRate / 100) * 100) / 100;
    return {
      product_id: line.productId,
      quantity: line.quantity,
      unit_price: unitPrice,
      tax_amount: taxAmount,
    };
  });

  const { data, error } = await supabase.rpc("process_sale", {
    p_store_id: params.storeId,
    p_cash_shift_id: params.cashShiftId,
    p_customer_id: params.customerId,
    p_items: items,
    p_payments: params.payments,
  });

  if (error) throw error;
  return data as string; // sale id
}
