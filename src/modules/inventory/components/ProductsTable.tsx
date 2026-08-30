import { ImageOff, Pencil, PackageX } from "lucide-react";
import type { ProductWithRelations } from "@/shared/types/catalog";
import { getProductImageUrl } from "@/modules/inventory/api/catalogApi";

interface ProductsTableProps {
  products: ProductWithRelations[];
  loading?: boolean;
  onEdit: (product: ProductWithRelations) => void;
  onDeactivate: (product: ProductWithRelations) => void;
}

export function ProductsTable({ products, loading, onEdit, onDeactivate }: ProductsTableProps) {
  if (loading) {
    return <div className="py-16 text-center text-slate-400">Cargando productos...</div>;
  }

  if (products.length === 0) {
    return (
      <div className="py-16 text-center text-slate-400">
        No se encontraron productos con estos filtros.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Producto</th>
            <th className="px-4 py-3">SKU</th>
            <th className="px-4 py-3">Categoría</th>
            <th className="px-4 py-3 text-right">Costo</th>
            <th className="px-4 py-3 text-right">Venta</th>
            <th className="px-4 py-3 text-right">Margen</th>
            <th className="px-4 py-3 text-right">Stock total</th>
            <th className="px-4 py-3 text-center">Estado</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {products.map((product) => {
            const primaryImage = product.images.find((i) => i.is_primary) ?? product.images[0];
            const margin =
              product.sale_price > 0
                ? (((product.sale_price - product.cost_price) / product.sale_price) * 100).toFixed(1)
                : "—";
            const lowStock =
              (product.total_stock ?? 0) <= 0;

            return (
              <tr key={product.id} className="hover:bg-slate-50/60">
                <td className="flex items-center gap-3 px-4 py-3">
                  {primaryImage ? (
                    <img
                      src={getProductImageUrl(primaryImage.storage_path)}
                      alt=""
                      className="h-10 w-10 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-300">
                      <ImageOff className="h-4 w-4" />
                    </div>
                  )}
                  <div>
                    <p className="font-medium text-slate-900">{product.name}</p>
                    {product.brand && <p className="text-xs text-slate-400">{product.brand.name}</p>}
                  </div>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{product.sku}</td>
                <td className="px-4 py-3 text-slate-600">{product.category?.name ?? "—"}</td>
                <td className="px-4 py-3 text-right text-slate-600">
                  ${product.cost_price.toFixed(2)}
                </td>
                <td className="px-4 py-3 text-right font-medium text-slate-900">
                  ${product.sale_price.toFixed(2)}
                </td>
                <td className="px-4 py-3 text-right text-emerald-600">{margin}%</td>
                <td
                  className={
                    "px-4 py-3 text-right font-medium " +
                    (lowStock ? "text-rose-500" : "text-slate-700")
                  }
                >
                  {product.total_stock ?? 0}
                </td>
                <td className="px-4 py-3 text-center">
                  <span
                    className={
                      "rounded-full px-2 py-0.5 text-xs font-medium " +
                      (product.is_active
                        ? "bg-emerald-50 text-emerald-600"
                        : "bg-slate-100 text-slate-400")
                    }
                  >
                    {product.is_active ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <button
                      onClick={() => onEdit(product)}
                      className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      aria-label="Editar"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    {product.is_active && (
                      <button
                        onClick={() => onDeactivate(product)}
                        className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-500"
                        aria-label="Dar de baja"
                      >
                        <PackageX className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
