import { isFractionalUnit } from "@/shared/types/pos";
import type { ReceiptData } from "@/shared/types/pos";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  transfer: "Transferencia",
  credit: "Fiado",
};

interface ThermalReceiptProps {
  data: ReceiptData;
  /** Ancho físico del papel — determina el ancho del componente en pantalla y al imprimir */
  paperWidth: "58mm" | "80mm";
}

/**
 * Vista de ticket con proporciones y tipografía pensadas para impresoras
 * térmicas de recibo (58mm/80mm). El navegador no puede hablar directo con
 * el lenguaje ESC/POS de una impresora térmica — eso requiere un agente
 * local (ej. QZ Tray) o una integración nativa — pero la gran mayoría de
 * impresoras térmicas USB/Bluetooth de punto de venta se instalan en el
 * sistema operativo como una impresora normal de texto/recibo, y en ese caso
 * `window.print()` con este layout (ver ReceiptModal) imprime correctamente
 * en el papel de 58/80mm sin software adicional.
 */
export function ThermalReceipt({ data, paperWidth }: ThermalReceiptProps) {
  const { context, totals, lines, payments, discountPercent } = data;
  const widthClass = paperWidth === "58mm" ? "w-[58mm] text-[10px]" : "w-[80mm] text-[11px]";
  const cashPayment = payments.find((p) => p.method === "cash");

  return (
    <div
      id="thermal-receipt"
      className={`${widthClass} mx-auto bg-white px-2 py-3 font-mono leading-tight text-black`}
    >
      <div className="text-center">
        <p className="text-sm font-bold uppercase">{context.businessName}</p>
        <p>{context.storeName}</p>
        {context.storeAddress && <p>{context.storeAddress}</p>}
      </div>

      <div className="my-1.5 border-t border-dashed border-black" />

      <div className="flex justify-between">
        <span>Fecha</span>
        <span>{new Date(data.createdAt).toLocaleString()}</span>
      </div>
      <div className="flex justify-between">
        <span>Cajero</span>
        <span>{data.cashierName}</span>
      </div>
      <div className="flex justify-between">
        <span>Venta</span>
        <span>#{data.saleId.slice(0, 8)}</span>
      </div>
      {data.customerName && (
        <div className="flex justify-between">
          <span>Cliente</span>
          <span>{data.customerName}</span>
        </div>
      )}

      <div className="my-1.5 border-t border-dashed border-black" />

      <table className="w-full">
        <thead>
          <tr>
            <th className="text-left font-normal">Producto</th>
            <th className="text-right font-normal">Cant.</th>
            <th className="text-right font-normal">V/Unit</th>
            <th className="text-right font-normal">Total</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.productId}>
              <td colSpan={4} className="pt-1 font-semibold">
                {line.name}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Se repite en una segunda pasada para poder alinear cantidad/precio/total
          debajo del nombre sin que el nombre largo desalinee las columnas numéricas. */}
      {lines.map((line) => (
        <div key={`${line.productId}-vals`} className="mb-1 flex justify-between">
          <span>
            {line.quantity.toFixed(isFractionalUnit(line.unitCode) ? 3 : 0)}
            {line.unitCode ? ` ${line.unitCode}` : ""} x ${line.unitPrice.toFixed(2)}
          </span>
          <span className="font-semibold">${(line.quantity * line.unitPrice).toFixed(2)}</span>
        </div>
      ))}

      <div className="my-1.5 border-t border-dashed border-black" />

      <div className="flex justify-between">
        <span>Subtotal</span>
        <span>${totals.grossSubtotal.toFixed(2)}</span>
      </div>
      {discountPercent > 0 && (
        <div className="flex justify-between">
          <span>Descuento ({discountPercent}%)</span>
          <span>-${totals.discountAmount.toFixed(2)}</span>
        </div>
      )}
      <div className="flex justify-between">
        <span>Impuestos</span>
        <span>${totals.taxTotal.toFixed(2)}</span>
      </div>
      <div className="mt-1 flex justify-between text-sm font-bold">
        <span>TOTAL</span>
        <span>${totals.total.toFixed(2)}</span>
      </div>

      <div className="my-1.5 border-t border-dashed border-black" />

      {payments.map((p, i) => (
        <div key={i} className="flex justify-between">
          <span>{PAYMENT_METHOD_LABELS[p.method] ?? p.method}</span>
          <span>${p.amount.toFixed(2)}</span>
        </div>
      ))}
      {cashPayment && cashPayment.change_given > 0 && (
        <div className="flex justify-between font-semibold">
          <span>Cambio</span>
          <span>${cashPayment.change_given.toFixed(2)}</span>
        </div>
      )}

      <div className="my-1.5 border-t border-dashed border-black" />
      <p className="text-center">¡Gracias por su compra!</p>
    </div>
  );
}
