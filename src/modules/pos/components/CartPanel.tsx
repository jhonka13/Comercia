import { Minus, Plus, ShoppingCart, Trash2, UserRound, X } from "lucide-react";
import { useCartStore } from "@/modules/pos/store/cartStore";
import { computeCartTotals } from "@/modules/pos/lib/cartMath";
import { isFractionalUnit, quantityDecimals } from "@/shared/types/pos";
import type { CartLine } from "@/shared/types/pos";

interface CartPanelProps {
  onCheckout: () => void;
  onPickCustomer: () => void;
}

/**
 * Grilla de venta estilo Excel: cada línea es una fila editable (cantidad,
 * precio unitario) con su subtotal recalculado en vivo — igual que trabajar
 * sobre una hoja de cálculo, pero validado contra el stock disponible y con
 * los mismos totales que luego valida `process_sale` en el servidor.
 */
export function CartPanel({ onCheckout, onPickCustomer }: CartPanelProps) {
  const lines = useCartStore((s) => s.lines);
  const discountPercent = useCartStore((s) => s.discountPercent);
  const setDiscountPercent = useCartStore((s) => s.setDiscountPercent);
  const incrementLine = useCartStore((s) => s.incrementLine);
  const decrementLine = useCartStore((s) => s.decrementLine);
  const setLineQuantity = useCartStore((s) => s.setLineQuantity);
  const setLineUnitPrice = useCartStore((s) => s.setLineUnitPrice);
  const removeLine = useCartStore((s) => s.removeLine);
  const customer = useCartStore((s) => s.customer);
  const setCustomer = useCartStore((s) => s.setCustomer);

  const totals = computeCartTotals(lines, discountPercent);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-bold text-slate-900">
          <ShoppingCart className="h-5 w-5" />
          Detalle de venta
        </h2>
        <span className="text-sm text-slate-400">{lines.length} productos</span>
      </div>

      <button
        onClick={onPickCustomer}
        className="mb-3 flex items-center justify-between rounded-xl border border-dashed border-slate-200 px-3 py-2 text-left text-sm text-slate-500 hover:border-emerald-300"
      >
        <span className="flex items-center gap-2">
          <UserRound className="h-4 w-4" />
          {customer ? customer.full_name : "Venta sin cliente (opcional)"}
        </span>
        {customer && (
          <X
            className="h-4 w-4 text-slate-400 hover:text-rose-500"
            onClick={(e) => {
              e.stopPropagation();
              setCustomer(null);
            }}
          />
        )}
      </button>

      <div className="flex-1 overflow-auto rounded-xl border border-slate-200">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="border-b border-slate-200 px-3 py-2">Producto</th>
              <th className="border-b border-slate-200 px-3 py-2 text-center">Cant.</th>
              <th className="border-b border-slate-200 px-3 py-2 text-right">Precio unit.</th>
              <th className="border-b border-slate-200 px-3 py-2 text-right">Subtotal</th>
              <th className="border-b border-slate-200 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <tr>
                <td colSpan={5} className="py-12 text-center text-sm text-slate-300">
                  Escanea o busca un producto para agregarlo
                </td>
              </tr>
            )}
            {lines.map((line) => (
              <GridRow
                key={line.productId}
                line={line}
                onIncrement={() => incrementLine(line.productId)}
                onDecrement={() => decrementLine(line.productId)}
                onQuantityChange={(q) => setLineQuantity(line.productId, q)}
                onUnitPriceChange={(p) => setLineUnitPrice(line.productId, p)}
                onRemove={() => removeLine(line.productId)}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
        <div className="flex items-center justify-between text-sm">
          <label htmlFor="discount" className="text-slate-500">
            Descuento
          </label>
          <div className="flex items-center gap-1">
            <input
              id="discount"
              type="number"
              min={0}
              max={100}
              value={discountPercent}
              onChange={(e) => setDiscountPercent(Number(e.target.value))}
              className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-right outline-none focus:border-emerald-400"
            />
            <span className="text-slate-400">%</span>
          </div>
        </div>

        <div className="flex justify-between text-sm text-slate-500">
          <span>Subtotal</span>
          <span>${totals.grossSubtotal.toFixed(2)}</span>
        </div>
        {totals.discountAmount > 0 && (
          <div className="flex justify-between text-sm text-rose-500">
            <span>Descuento</span>
            <span>-${totals.discountAmount.toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between text-sm text-slate-500">
          <span>Impuestos</span>
          <span>${totals.taxTotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between border-t border-slate-100 pt-2 text-lg font-bold text-slate-900">
          <span>Total</span>
          <span>${totals.total.toFixed(2)}</span>
        </div>

        <button
          onClick={onCheckout}
          disabled={lines.length === 0}
          className="mt-2 w-full rounded-xl bg-emerald-400 py-3.5 text-lg font-bold text-black transition hover:bg-emerald-300 disabled:opacity-40"
        >
          Cobrar ${totals.total.toFixed(2)}
        </button>
      </div>
    </div>
  );
}

interface GridRowProps {
  line: CartLine;
  onIncrement: () => void;
  onDecrement: () => void;
  onQuantityChange: (q: number) => void;
  onUnitPriceChange: (p: number) => void;
  onRemove: () => void;
}

function GridRow({
  line,
  onIncrement,
  onDecrement,
  onQuantityChange,
  onUnitPriceChange,
  onRemove,
}: GridRowProps) {
  const fractional = isFractionalUnit(line.unitCode);
  const decimals = quantityDecimals(line.unitCode);
  const atMax = line.quantity >= line.availableStock;
  const subtotal = line.unitPrice * line.quantity;

  return (
    <tr className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/60">
      <td className="px-3 py-2 align-top">
        <p className="font-medium text-slate-900">{line.name}</p>
        <p className="text-xs text-slate-400">
          {line.sku} {line.unitCode ? `· ${line.unitCode}` : ""}
        </p>
        {atMax && <p className="mt-0.5 text-[11px] text-amber-500">Stock máximo disponible</p>}
      </td>
      <td className="px-2 py-2">
        <div className="flex items-center justify-center gap-1">
          <button
            onClick={onDecrement}
            className="rounded-lg bg-slate-100 p-1 text-slate-600 hover:bg-slate-200"
            tabIndex={-1}
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <input
            type="number"
            value={line.quantity}
            step={fractional ? 1 / 10 ** Math.max(decimals, 1) : 1}
            min={0}
            max={line.availableStock}
            onChange={(e) => onQuantityChange(Number(e.target.value))}
            className="w-16 rounded-lg border border-slate-200 px-1 py-1 text-center outline-none focus:border-emerald-400"
          />
          <button
            onClick={onIncrement}
            disabled={atMax}
            className="rounded-lg bg-slate-100 p-1 text-slate-600 hover:bg-slate-200 disabled:opacity-40"
            tabIndex={-1}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
      <td className="px-3 py-2 text-right">
        <input
          type="number"
          value={line.unitPrice}
          step={0.01}
          min={0}
          onChange={(e) => onUnitPriceChange(Number(e.target.value))}
          className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-right outline-none focus:border-emerald-400"
        />
      </td>
      <td className="px-3 py-2 text-right font-semibold text-slate-900">${subtotal.toFixed(2)}</td>
      <td className="px-2 py-2 text-center">
        <button onClick={onRemove} className="text-slate-300 hover:text-rose-500">
          <Trash2 className="h-4 w-4" />
        </button>
      </td>
    </tr>
  );
}
