import { useEffect, useState } from "react";
import { ArrowRight, Trash2, X } from "lucide-react";
import { BarcodeScannerInput } from "@/modules/inventory/components/BarcodeScannerInput";
import { useProductByBarcode } from "@/modules/inventory/hooks/useProducts";
import { useCreateTransfer, useStockAtStore, useStores } from "@/modules/transfers/hooks/useTransfers";
import type { TransferDraftItem } from "@/shared/types/transfers";

interface CreateTransferModalProps {
  originStoreId: string;
  onClose: () => void;
}

export function CreateTransferModal({ originStoreId, onClose }: CreateTransferModalProps) {
  const { data: stores } = useStores();
  const createTransfer = useCreateTransfer();

  const [destinationStoreId, setDestinationStoreId] = useState("");
  const [items, setItems] = useState<TransferDraftItem[]>([]);
  const [scanned, setScanned] = useState<string | null>(null);
  const [pendingQuantity, setPendingQuantity] = useState("1");
  const [error, setError] = useState<string | null>(null);

  const { data: barcodeMatch } = useProductByBarcode(scanned);
  const { data: availableStock } = useStockAtStore(barcodeMatch?.id ?? null, originStoreId);

  const destinationOptions = (stores ?? []).filter((s) => s.id !== originStoreId);

  useEffect(() => {
    if (scanned && barcodeMatch !== undefined) {
      if (!barcodeMatch) {
        setError(`Sin coincidencias para el código ${scanned}.`);
      }
      setScanned(null);
    }
  }, [scanned, barcodeMatch]);

  const handleAddItem = () => {
    if (!barcodeMatch) return;
    const quantity = Number(pendingQuantity);
    const stock = availableStock ?? 0;

    if (!quantity || quantity <= 0) {
      setError("Indica una cantidad mayor a cero.");
      return;
    }
    if (quantity > stock) {
      setError(`Solo hay ${stock} unidades disponibles de "${barcodeMatch.name}" en esta tienda.`);
      return;
    }

    setError(null);
    setItems((prev) => {
      const existing = prev.find((i) => i.product_id === barcodeMatch.id);
      if (existing) {
        return prev.map((i) =>
          i.product_id === barcodeMatch.id ? { ...i, quantity: i.quantity + quantity } : i
        );
      }
      return [
        ...prev,
        {
          product_id: barcodeMatch.id,
          product_name: barcodeMatch.name,
          sku: barcodeMatch.sku,
          quantity,
          available_stock: stock,
        },
      ];
    });
    setPendingQuantity("1");
  };

  const handleRemoveItem = (productId: string) => {
    setItems((prev) => prev.filter((i) => i.product_id !== productId));
  };

  const handleSubmit = async () => {
    setError(null);
    if (!destinationStoreId) {
      setError("Selecciona la tienda de destino.");
      return;
    }
    if (items.length === 0) {
      setError("Agrega al menos un producto al traslado.");
      return;
    }
    try {
      await createTransfer.mutateAsync({
        originStoreId,
        destinationStoreId,
        items: items.map((i) => ({ productId: i.product_id, quantity: i.quantity })),
      });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-bold text-slate-900">Nuevo traslado entre sucursales</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
              Tienda de destino
            </label>
            <select
              value={destinationStoreId}
              onChange={(e) => setDestinationStoreId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-emerald-400"
            >
              <option value="">Selecciona una tienda...</option>
              {destinationOptions.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-xl border border-slate-100 p-4">
            <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
              Agregar producto (desde el stock de esta tienda)
            </label>
            <BarcodeScannerInput onScan={setScanned} placeholder="Escanea o busca el producto..." />

            {barcodeMatch && (
              <div className="mt-3 flex items-end gap-3 rounded-lg bg-slate-50 px-3 py-3">
                <div className="flex-1">
                  <p className="font-medium text-slate-900">{barcodeMatch.name}</p>
                  <p className="text-xs text-slate-500">
                    Disponible en esta tienda: {availableStock ?? 0}
                  </p>
                </div>
                <div className="w-24">
                  <input
                    type="number"
                    min={1}
                    value={pendingQuantity}
                    onChange={(e) => setPendingQuantity(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-right outline-none focus:border-emerald-400"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-black hover:bg-emerald-300"
                >
                  Agregar
                </button>
              </div>
            )}
          </div>

          {items.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase text-slate-500">
                Productos a trasladar ({items.length})
              </p>
              {items.map((item) => (
                <div
                  key={item.product_id}
                  className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900">{item.product_name}</p>
                    <p className="text-xs text-slate-500">
                      {item.quantity} unidades · SKU {item.sku}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveItem(item.product_id)}
                    className="text-slate-400 hover:text-rose-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {destinationStoreId && items.length > 0 && (
            <div className="flex items-center justify-center gap-2 rounded-lg bg-slate-50 py-2 text-sm text-slate-500">
              <span>Esta tienda</span>
              <ArrowRight className="h-4 w-4" />
              <span className="font-medium text-slate-700">
                {destinationOptions.find((s) => s.id === destinationStoreId)?.name}
              </span>
            </div>
          )}

          {error && <p className="text-sm text-rose-500">{error}</p>}
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-4">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-slate-500 hover:bg-slate-50">
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={createTransfer.isPending}
            className="rounded-lg bg-emerald-400 px-5 py-2 font-semibold text-black hover:bg-emerald-300 disabled:opacity-60"
          >
            {createTransfer.isPending ? "Despachando..." : "Despachar traslado"}
          </button>
        </div>
      </div>
    </div>
  );
}
