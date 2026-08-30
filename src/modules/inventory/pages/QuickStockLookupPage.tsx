import { useState } from "react";
import { ImageOff, PackagePlus } from "lucide-react";
import { BarcodeScannerInput } from "@/modules/inventory/components/BarcodeScannerInput";
import { getProductImageUrl } from "@/modules/inventory/api/catalogApi";
import {
  useProductByBarcode,
  useRegisterStockEntry,
  useStockByProduct,
} from "@/modules/inventory/hooks/useProducts";

interface QuickStockLookupPageProps {
  tenantId: string;
  currentStoreId: string;
  currentUserId: string;
}

/**
 * Pantalla pensada para piso de venta / recepción de mercancía: escanear un
 * producto, ver su stock por tienda al instante, y registrar una entrada
 * manual (ej. llegó un pallet sin orden de compra formal) sin salir de esta
 * vista. No reemplaza el módulo de traslados/compras — es el atajo rápido.
 */
export function QuickStockLookupPage({
  tenantId,
  currentStoreId,
  currentUserId,
}: QuickStockLookupPageProps) {
  const [barcode, setBarcode] = useState<string | null>(null);
  const [entryQty, setEntryQty] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);

  const { data: product, isFetching } = useProductByBarcode(barcode);
  const { data: stock } = useStockByProduct(product?.id ?? null);
  const registerEntry = useRegisterStockEntry();

  const handleScan = (code: string) => {
    setFeedback(null);
    setEntryQty("");
    setBarcode(code);
  };

  const handleRegisterEntry = async () => {
    if (!product) return;
    const quantity = Number(entryQty);
    if (!quantity || quantity <= 0) return;

    await registerEntry.mutateAsync({
      tenantId,
      productId: product.id,
      storeId: currentStoreId,
      quantity,
      performedBy: currentUserId,
    });
    setFeedback(`Se sumaron ${quantity} unidades a esta tienda.`);
    setEntryQty("");
  };

  const stockInCurrentStore = stock?.find((s) => s.store_id === currentStoreId);

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Consulta rápida</h1>
      <p className="mb-6 text-sm text-slate-500">
        Escanea un producto para ver precio y stock, o registrar una entrada.
      </p>

      <BarcodeScannerInput onScan={handleScan} placeholder="Escanea un código de barras..." />

      {isFetching && <p className="mt-6 text-center text-slate-400">Buscando...</p>}

      {!isFetching && barcode && product === null && (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-700">
          No se encontró ningún producto con el código <span className="font-mono">{barcode}</span>.
        </div>
      )}

      {product && (
        <div className="mt-6 rounded-2xl border border-slate-200 p-5">
          <div className="flex gap-4">
            {product.images[0] ? (
              <img
                src={getProductImageUrl(product.images[0].storage_path)}
                alt=""
                className="h-20 w-20 rounded-xl object-cover"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-slate-100 text-slate-300">
                <ImageOff className="h-6 w-6" />
              </div>
            )}
            <div className="flex-1">
              <p className="font-bold text-slate-900">{product.name}</p>
              <p className="text-xs text-slate-400">SKU: {product.sku}</p>
              <p className="mt-1 text-lg font-semibold text-emerald-600">
                ${product.sale_price.toFixed(2)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase text-slate-400">Stock en esta tienda</p>
              <p
                className={
                  "text-2xl font-bold " +
                  ((stockInCurrentStore?.quantity ?? 0) <= 0 ? "text-rose-500" : "text-slate-900")
                }
              >
                {stockInCurrentStore?.quantity ?? 0}
              </p>
            </div>
          </div>

          {stock && stock.length > 1 && (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <p className="mb-2 text-xs font-semibold uppercase text-slate-400">
                Stock en otras tiendas
              </p>
              <ul className="space-y-1 text-sm text-slate-600">
                {stock
                  .filter((s) => s.store_id !== currentStoreId)
                  .map((s) => (
                    <li key={s.id} className="flex justify-between">
                      <span>{s.store.name}</span>
                      <span className="font-medium">{s.quantity}</span>
                    </li>
                  ))}
              </ul>
            </div>
          )}

          <div className="mt-5 flex items-end gap-3 border-t border-slate-100 pt-4">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                Registrar entrada manual
              </label>
              <input
                type="number"
                min={1}
                value={entryQty}
                onChange={(e) => setEntryQty(e.target.value)}
                placeholder="Cantidad recibida"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-emerald-400"
              />
            </div>
            <button
              onClick={handleRegisterEntry}
              disabled={registerEntry.isPending || !entryQty}
              className="flex items-center gap-2 rounded-lg bg-emerald-400 px-4 py-2 font-semibold text-black hover:bg-emerald-300 disabled:opacity-60"
            >
              <PackagePlus className="h-4 w-4" />
              {registerEntry.isPending ? "Guardando..." : "Sumar al stock"}
            </button>
          </div>

          {feedback && <p className="mt-3 text-sm text-emerald-600">{feedback}</p>}
        </div>
      )}
    </div>
  );
}
