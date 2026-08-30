import { useState } from "react";
import { CheckCircle2, PackagePlus, Send } from "lucide-react";
import { useCreatePurchaseOrder, usePurchaseSuggestions } from "@/modules/procurement/hooks/useProcurement";
import type { PurchaseSuggestionLine, SupplierSuggestionGroup } from "@/shared/types/procurement";

interface PurchaseSuggestionsViewProps {
  storeId: string;
}

function groupBySupplier(lines: PurchaseSuggestionLine[]): SupplierSuggestionGroup[] {
  const map = new Map<string, SupplierSuggestionGroup>();
  for (const line of lines) {
    const key = line.supplier_id ?? "__none__";
    if (!map.has(key)) {
      map.set(key, {
        supplierId: line.supplier_id,
        supplierName: line.supplier_name ?? "Sin proveedor asignado",
        lines: [],
        totalEstimatedCost: 0,
      });
    }
    const group = map.get(key)!;
    group.lines.push(line);
    group.totalEstimatedCost += line.estimated_cost;
  }
  // Los grupos sin proveedor van al final — no se puede generar una orden de
  // compra hasta que alguien les asigne un proveedor en el catálogo.
  return [...map.values()].sort((a, b) => {
    if (a.supplierId === null) return 1;
    if (b.supplierId === null) return -1;
    return a.supplierName.localeCompare(b.supplierName);
  });
}

export function PurchaseSuggestionsView({ storeId }: PurchaseSuggestionsViewProps) {
  const [coverageDays, setCoverageDays] = useState(14);
  const { data: suggestions, isLoading } = usePurchaseSuggestions(storeId, coverageDays);

  if (isLoading) return <p className="py-8 text-center text-slate-400">Calculando sugerencias...</p>;

  const groups = groupBySupplier(suggestions ?? []);

  if (groups.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-slate-300">
        No hay productos con stock crítico en este momento.
      </p>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-2 text-sm text-slate-500">
        <span>Cubrir</span>
        <select
          value={coverageDays}
          onChange={(e) => setCoverageDays(Number(e.target.value))}
          className="rounded-lg border border-slate-200 bg-white px-2 py-1 outline-none focus:border-emerald-400"
        >
          <option value={7}>7 días</option>
          <option value={14}>14 días</option>
          <option value={30}>30 días</option>
        </select>
        <span>de ventas proyectadas al calcular la cantidad sugerida.</span>
      </div>

      <div className="space-y-4">
        {groups.map((group) => (
          <SupplierGroupCard key={group.supplierId ?? "none"} group={group} storeId={storeId} />
        ))}
      </div>
    </div>
  );
}

function SupplierGroupCard({ group, storeId }: { group: SupplierSuggestionGroup; storeId: string }) {
  const [editedQuantities, setEditedQuantities] = useState<Record<string, number>>({});
  const [sentOrderId, setSentOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const createOrder = useCreatePurchaseOrder(storeId);

  const quantityFor = (line: PurchaseSuggestionLine) =>
    editedQuantities[line.product_id] ?? line.suggested_quantity;

  const total = group.lines.reduce(
    (sum, line) => sum + quantityFor(line) * line.unit_cost,
    0
  );

  const handleGenerateOrder = async () => {
    if (!group.supplierId) return;
    setError(null);
    try {
      const items = group.lines
        .map((line) => ({
          product_id: line.product_id,
          quantity: quantityFor(line),
          unit_cost: line.unit_cost,
        }))
        .filter((i) => i.quantity > 0);

      const orderId = await createOrder.mutateAsync({
        storeId,
        supplierId: group.supplierId,
        items,
      });
      setSentOrderId(orderId);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="font-bold text-slate-900">{group.supplierName}</h4>
        <span className="text-sm font-semibold text-slate-500">
          {group.lines.length} producto(s) · ${total.toFixed(2)}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="py-2">Producto</th>
              <th className="py-2 text-right">Stock</th>
              <th className="py-2 text-right">Mínimo</th>
              <th className="py-2 text-right">Venta/día</th>
              <th className="py-2 text-right">Sugerido</th>
              <th className="py-2 text-right">Costo est.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {group.lines.map((line) => (
              <tr key={line.product_id}>
                <td className="py-2">
                  <p className="font-medium text-slate-800">{line.product_name}</p>
                  <p className="text-xs text-slate-400">{line.sku}</p>
                </td>
                <td className="py-2 text-right text-slate-600">
                  {line.current_quantity} {line.unit_code ?? ""}
                </td>
                <td className="py-2 text-right text-slate-400">{line.min_quantity}</td>
                <td className="py-2 text-right text-slate-400">{line.avg_daily_sales}</td>
                <td className="py-2 text-right">
                  <input
                    type="number"
                    min={0}
                    value={quantityFor(line)}
                    onChange={(e) =>
                      setEditedQuantities((prev) => ({
                        ...prev,
                        [line.product_id]: Number(e.target.value),
                      }))
                    }
                    className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-right outline-none focus:border-emerald-400"
                  />
                </td>
                <td className="py-2 text-right font-semibold text-slate-700">
                  ${(quantityFor(line) * line.unit_cost).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error && <p className="mt-2 text-sm text-rose-500">{error}</p>}

      <div className="mt-4 flex justify-end">
        {sentOrderId ? (
          <span className="flex items-center gap-2 text-sm font-semibold text-emerald-600">
            <CheckCircle2 className="h-4 w-4" />
            Orden de compra generada
          </span>
        ) : group.supplierId ? (
          <button
            onClick={handleGenerateOrder}
            disabled={createOrder.isPending}
            className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            <Send className="h-4 w-4" />
            {createOrder.isPending ? "Generando..." : "Generar orden de compra"}
          </button>
        ) : (
          <span className="flex items-center gap-2 text-xs text-slate-400">
            <PackagePlus className="h-4 w-4" />
            Asigna un proveedor preferido a estos productos para poder generar la orden.
          </span>
        )}
      </div>
    </div>
  );
}
