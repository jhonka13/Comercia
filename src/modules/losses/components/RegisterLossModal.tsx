import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { BarcodeScannerInput } from "@/modules/inventory/components/BarcodeScannerInput";
import { useProductByBarcode } from "@/modules/inventory/hooks/useProducts";
import { useBatchesForProduct, useRegisterLoss, useSuppliers } from "@/modules/losses/hooks/useLosses";
import { LOSS_CLASSIFICATION_LABELS, LOSS_REASON_LABELS } from "@/shared/types/losses";
import type { LossClassification, LossReason } from "@/shared/types/losses";
import type { InventoryBatchWithProduct } from "@/shared/types/losses";
import type { ProductWithRelations } from "@/shared/types/catalog";

interface RegisterLossModalProps {
  storeId: string;
  /** Si viene de una alerta de vencimiento, precarga producto/lote/motivo */
  prefillBatch?: InventoryBatchWithProduct | null;
  onClose: () => void;
}

export function RegisterLossModal({ storeId, prefillBatch, onClose }: RegisterLossModalProps) {
  const [product, setProduct] = useState<ProductWithRelations | null>(null);
  const [scanned, setScanned] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState<LossReason>(prefillBatch ? "expired" : "damaged");
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(prefillBatch?.id ?? null);
  const [classification, setClassification] = useState<LossClassification>("net_loss");
  const [supplierId, setSupplierId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const { data: barcodeMatch } = useProductByBarcode(scanned);
  const { data: batches } = useBatchesForProduct(
    reason === "expired" ? (product?.id ?? prefillBatch?.product_id ?? null) : null,
    storeId
  );
  const { data: suppliers } = useSuppliers();
  const registerLoss = useRegisterLoss(storeId);

  useEffect(() => {
    if (scanned && barcodeMatch !== undefined) {
      if (barcodeMatch) {
        setProduct(barcodeMatch);
        setError(null);
      } else {
        setError(`Sin coincidencias para el código ${scanned}.`);
      }
      setScanned(null);
    }
  }, [scanned, barcodeMatch]);

  // Un hurto no puede gestionarse con el proveedor — si el cajero cambia el
  // motivo a "theft" después de haber marcado "pendiente de reintegro",
  // volvemos automáticamente a pérdida neta para no dejar un estado inválido.
  useEffect(() => {
    if (reason === "theft" && classification === "supplier_return") {
      setClassification("net_loss");
    }
  }, [reason, classification]);

  const productId = product?.id ?? prefillBatch?.product_id ?? null;
  const productName = product?.name ?? prefillBatch?.product.name ?? null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!productId) {
      setError("Selecciona un producto primero.");
      return;
    }
    const qty = Number(quantity);
    if (!qty || qty <= 0) {
      setError("La cantidad debe ser mayor a cero.");
      return;
    }
    if (classification === "supplier_return" && !supplierId) {
      setError("Selecciona el proveedor con el que se gestionará el reintegro.");
      return;
    }
    try {
      await registerLoss.mutateAsync({
        productId,
        quantity: qty,
        reason,
        batchId: reason === "expired" ? selectedBatchId : null,
        classification,
        supplierId: classification === "supplier_return" ? supplierId : null,
      });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-bold text-slate-900">Registrar merma</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="max-h-[70vh] space-y-4 overflow-y-auto px-6 py-5">
          {!productId ? (
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                Producto
              </label>
              <BarcodeScannerInput onScan={setScanned} placeholder="Escanea o busca el producto..." />
            </div>
          ) : (
            <div className="rounded-xl bg-slate-50 px-4 py-3">
              <p className="font-medium text-slate-900">{productName}</p>
              {!prefillBatch && (
                <button
                  type="button"
                  onClick={() => setProduct(null)}
                  className="text-xs text-emerald-600 hover:underline"
                >
                  Cambiar producto
                </button>
              )}
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
              Cantidad
            </label>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-emerald-400"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
              Motivo
            </label>
            <select
              value={reason}
              onChange={(e) => {
                setReason(e.target.value as LossReason);
                setSelectedBatchId(null);
              }}
              disabled={!!prefillBatch}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 outline-none focus:border-emerald-400 disabled:bg-slate-50"
            >
              {Object.entries(LOSS_REASON_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {reason === "expired" && (
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                Lote (orden PEPS — el más antiguo primero)
              </label>
              <select
                value={selectedBatchId ?? ""}
                onChange={(e) => setSelectedBatchId(e.target.value || null)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 outline-none focus:border-emerald-400"
              >
                <option value="">Sin lote específico</option>
                {(batches ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.batch_code ?? "Sin código"} · {b.quantity} u. · vence{" "}
                    {b.expiration_date ?? "sin fecha"}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="border-t border-slate-100 pt-4">
            <label className="mb-2 block text-xs font-semibold uppercase text-slate-500">
              Clasificación contable
            </label>
            <div className="grid grid-cols-1 gap-2">
              {(Object.entries(LOSS_CLASSIFICATION_LABELS) as [LossClassification, string][]).map(
                ([value, label]) => {
                  const disabled = value === "supplier_return" && reason === "theft";
                  return (
                    <button
                      type="button"
                      key={value}
                      disabled={disabled}
                      onClick={() => setClassification(value)}
                      className={
                        "rounded-xl border px-4 py-3 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-40 " +
                        (classification === value
                          ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                          : "border-slate-200 text-slate-600 hover:border-slate-300")
                      }
                    >
                      <p className="font-semibold">{label}</p>
                      <p className="text-xs text-slate-400">
                        {value === "net_loss"
                          ? "El negocio asume el 100% del costo — impacta el reporte financiero de inmediato."
                          : "Queda pendiente en el módulo de finanzas hasta que el proveedor resuelva (nota crédito, reposición o reembolso)."}
                      </p>
                    </button>
                  );
                }
              )}
            </div>
            {reason === "theft" && (
              <p className="mt-1 text-xs text-slate-400">
                Un hurto siempre se clasifica como pérdida neta.
              </p>
            )}
          </div>

          {classification === "supplier_return" && (
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                Proveedor
              </label>
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 outline-none focus:border-emerald-400"
              >
                <option value="">Selecciona un proveedor...</option>
                {(suppliers ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {error && <p className="text-sm text-rose-500">{error}</p>}

          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-slate-500 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={registerLoss.isPending}
              className="rounded-lg bg-rose-500 px-5 py-2 font-semibold text-white hover:bg-rose-600 disabled:opacity-60"
            >
              {registerLoss.isPending ? "Registrando..." : "Registrar merma"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
