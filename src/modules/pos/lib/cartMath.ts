import type { CartLine, CartTotals } from "@/shared/types/pos";

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Calcula los totales del carrito en tiempo real.
 * El descuento se aplica como porcentaje global sobre el subtotal bruto, y
 * el impuesto de cada línea se calcula SOBRE EL MONTO YA DESCONTADO — así
 * el total mostrado en pantalla coincide exactamente con lo que
 * `process_sale` recalculará y guardará en el servidor (mismo criterio,
 * evita descuadres de un centavo entre el ticket y la base de datos).
 */
export function computeCartTotals(lines: CartLine[], discountPercent: number): CartTotals {
  let grossSubtotal = 0;
  let subtotal = 0;
  let taxTotal = 0;

  const discountFactor = 1 - Math.min(Math.max(discountPercent, 0), 100) / 100;

  for (const line of lines) {
    const lineGross = line.unitPrice * line.quantity;
    const lineDiscounted = lineGross * discountFactor;
    const lineTax = lineDiscounted * (line.taxRate / 100);

    grossSubtotal += lineGross;
    subtotal += lineDiscounted;
    taxTotal += lineTax;
  }

  grossSubtotal = round2(grossSubtotal);
  subtotal = round2(subtotal);
  taxTotal = round2(taxTotal);

  return {
    grossSubtotal,
    discountAmount: round2(grossSubtotal - subtotal),
    subtotal,
    taxTotal,
    total: round2(subtotal + taxTotal),
  };
}

/** Precio unitario ya con el descuento global aplicado — es lo que se envía a `process_sale` por línea */
export function discountedUnitPrice(unitPrice: number, discountPercent: number) {
  return round2(unitPrice * (1 - Math.min(Math.max(discountPercent, 0), 100) / 100));
}
