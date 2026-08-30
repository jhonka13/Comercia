import { useState } from "react";
import { ImageOff, PackageSearch } from "lucide-react";
import { BarcodeScannerInput } from "@/modules/inventory/components/BarcodeScannerInput";
import { getProductImageUrl } from "@/modules/inventory/api/catalogApi";
import { useProductByBarcode, useProducts } from "@/modules/inventory/hooks/useProducts";
import { useCartStore } from "@/modules/pos/store/cartStore";
import type { ProductWithRelations } from "@/shared/types/catalog";

interface ProductSearchPanelProps {
  /** stock disponible por producto en la tienda actual — se resuelve fuera para no repetir queries por producto */
  getStockFor: (productId: string) => number;
}

export function ProductSearchPanel({ getStockFor }: ProductSearchPanelProps) {
  const [scanned, setScanned] = useState<string | null>(null);
  const [textSearch, setTextSearch] = useState("");
  const [scanError, setScanError] = useState<string | null>(null);

  const addProduct = useCartStore((s) => s.addProduct);
  const { data: barcodeMatch } = useProductByBarcode(scanned);
  const { data: gridData, isLoading } = useProducts({
    search: textSearch,
    page: 0,
    pageSize: textSearch ? 12 : 15,
  });

  const handleAdd = (product: ProductWithRelations) => {
    const stock = getStockFor(product.id);
    if (stock <= 0) {
      setScanError(`"${product.name}" no tiene stock en esta tienda.`);
      setTimeout(() => setScanError(null), 2500);
      return;
    }
    addProduct(product, stock);
  };

  const handleScan = (code: string) => {
    setScanError(null);
    setScanned(code);
  };

  // Cuando resuelve el escaneo, agrega directo al carrito
  if (scanned && barcodeMatch !== undefined) {
    if (barcodeMatch) {
      handleAdd(barcodeMatch);
    } else {
      setScanError(`Sin coincidencias para el código ${scanned}.`);
      setTimeout(() => setScanError(null), 2500);
    }
    setScanned(null);
  }

  return (
    <div className="flex h-full flex-col">
      <BarcodeScannerInput onScan={handleScan} placeholder="Escanea un producto..." />

      {scanError && (
        <div className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{scanError}</div>
      )}

      <input
        value={textSearch}
        onChange={(e) => setTextSearch(e.target.value)}
        placeholder="Buscar por nombre..."
        className="mt-3 w-full rounded-xl border border-slate-200 px-4 py-2.5 outline-none focus:border-emerald-400"
      />

      <div className="mt-4 flex-1 overflow-y-auto">
        {isLoading && <p className="py-8 text-center text-slate-400">Cargando...</p>}

        {!isLoading && gridData?.products.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-12 text-slate-300">
            <PackageSearch className="h-8 w-8" />
            <p className="text-sm">Sin resultados</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {gridData?.products.map((product) => {
            const stock = getStockFor(product.id);
            const primaryImage = product.images.find((i) => i.is_primary) ?? product.images[0];
            return (
              <button
                key={product.id}
                onClick={() => handleAdd(product)}
                disabled={stock <= 0}
                className="flex flex-col items-center gap-1 rounded-xl border border-slate-200 p-2 text-center transition hover:border-emerald-300 hover:bg-emerald-50/50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {primaryImage ? (
                  <img
                    src={getProductImageUrl(primaryImage.storage_path)}
                    alt=""
                    className="h-14 w-14 rounded-lg object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-slate-100 text-slate-300">
                    <ImageOff className="h-5 w-5" />
                  </div>
                )}
                <p className="line-clamp-2 text-xs font-medium leading-tight text-slate-700">
                  {product.name}
                </p>
                <p className="text-xs font-semibold text-emerald-600">
                  ${product.sale_price.toFixed(2)}
                </p>
                {stock <= 0 && <p className="text-[10px] text-rose-400">Sin stock</p>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
