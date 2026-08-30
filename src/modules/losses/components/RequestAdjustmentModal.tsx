import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { BarcodeScannerInput } from "@/modules/inventory/components/BarcodeScannerInput";
import { useProductByBarcode } from "@/modules/inventory/hooks/useProducts";
import { useRequestAdjustment } from "@/modules/losses/hooks/useLosses";
import type { ProductWithRelations } from "@/shared/types/catalog";

interface RequestAdjustmentModalProps {
  storeId: string;
  onClose: () => void;
}

export function RequestAdjustmentModal({ storeId, onClose }: RequestAdjustmentModalProps) {
  const [product, setProduct] = useState<ProductWithRelations | null>(null);
  const [scanned, setScanned] = useState<string | null>(null);
  const [delta, setDelta] = useState("");
  const [justification, setJustification] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: barcodeMatch } = useProductByBarcode(scanned);
  const requestAdjustment = useRequestAdjustment(storeId);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!product) {
      setError("Selecciona un producto primero.");
      return;
    }
    const quantityDelta = Number(delta);
    if (!quantityDelta) {
      setError("Indica una cantidad distinta de cero (usa negativo para restar).");
      return;
    }
    if (!justification.trim()) {
      setError("La justificación es obligatoria.");
      return;
    }
    try {
      await requestAdjustment.mutateAsync({
        productId: product.id,
        quantityDelta,
        justification,
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
          <h2 className="text-lg font-bold text-slate-900">Solicitar ajuste de stock</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Este ajuste no se aplica de inmediato: queda pendiente hasta que un supervisor lo
            revise y apruebe.
          </p>

          {!product ? (
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                Producto
              </label>
              <BarcodeScannerInput onScan={setScanned} placeholder="Escanea o busca el producto..." />
            </div>
          ) : (
            <div className="rounded-xl bg-slate-50 px-4 py-3">
              <p className="font-medium text-slate-900">{product.name}</p>
              <button
                type="button"
                onClick={() => setProduct(null)}
                className="text-xs text-emerald-600 hover:underline"
              >
                Cambiar producto
              </button>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
              Cantidad a ajustar
            </label>
            <input
              type="number"
              value={delta}
              onChange={(e) => setDelta(e.target.value)}
              placeholder="Ej. -5 para restar, 10 para sumar"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-emerald-400"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
              Justificación
            </label>
            <textarea
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              rows={3}
              placeholder="Ej. Conteo físico de fin de mes encontró diferencia..."
              className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-emerald-400"
            />
          </div>

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
              disabled={requestAdjustment.isPending}
              className="rounded-lg bg-emerald-400 px-5 py-2 font-semibold text-black hover:bg-emerald-300 disabled:opacity-60"
            >
              {requestAdjustment.isPending ? "Enviando..." : "Enviar a aprobación"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
