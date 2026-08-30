import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import {
  useCategories,
  useCreateProduct,
  useDeactivateProduct,
  useProductByBarcode,
  useProducts,
  useUpdateProduct,
} from "@/modules/inventory/hooks/useProducts";
import { BarcodeScannerInput } from "@/modules/inventory/components/BarcodeScannerInput";
import { ProductsTable } from "@/modules/inventory/components/ProductsTable";
import { ProductForm } from "@/modules/inventory/components/ProductForm";
import type { ProductFormValues, ProductWithRelations } from "@/shared/types/catalog";

interface ProductCatalogPageProps {
  tenantId: string;
}

const PAGE_SIZE = 25;

export function ProductCatalogPage({ tenantId }: ProductCatalogPageProps) {
  const [search, setSearch] = useState("");
  const [scannedBarcode, setScannedBarcode] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [editingProduct, setEditingProduct] = useState<ProductWithRelations | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const { data: categories } = useCategories();
  const { data, isLoading } = useProducts({ search, categoryId, page, pageSize: PAGE_SIZE });
  const { data: barcodeMatch } = useProductByBarcode(scannedBarcode);

  const createProduct = useCreateProduct(tenantId);
  const updateProduct = useUpdateProduct();
  const deactivateProduct = useDeactivateProduct();

  // Si el código escaneado corresponde a un producto existente, lo abre
  // directo en modo edición; si no existe, precarga el código en un
  // producto nuevo para no tener que volver a escanearlo.
  const handleScan = (code: string) => {
    setScannedBarcode(code);
    setSearch("");
  };

  useEffect(() => {
    if (!scannedBarcode || barcodeMatch === undefined) return;
    setEditingProduct(barcodeMatch ?? null);
    setFormOpen(true);
    setScannedBarcode(null);
    // barcodeMatch llega en `undefined` mientras carga, `null` si no hay
    // coincidencia y el objeto si existe — solo actuamos cuando ya resolvió.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scannedBarcode, barcodeMatch]);

  const handleSubmit = async (values: ProductFormValues) => {
    if (editingProduct) {
      await updateProduct.mutateAsync({ id: editingProduct.id, values });
    } else {
      await createProduct.mutateAsync(values);
    }
    setFormOpen(false);
    setEditingProduct(null);
  };

  const handleDeactivate = async (product: ProductWithRelations) => {
    if (!confirm(`¿Dar de baja "${product.name}"? Dejará de aparecer en el POS.`)) return;
    await deactivateProduct.mutateAsync(product.id);
  };

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Catálogo de productos</h1>
          <p className="text-sm text-slate-500">{data?.total ?? 0} productos activos</p>
        </div>
        <button
          onClick={() => {
            setEditingProduct(null);
            setFormOpen(true);
          }}
          className="flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 font-semibold text-black hover:bg-emerald-300"
        >
          <Plus className="h-4 w-4" />
          Nuevo producto
        </button>
      </div>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row">
        <div className="flex-1">
          <BarcodeScannerInput
            onScan={handleScan}
            placeholder="Escanea un código de barras para buscar o crear rápido..."
          />
        </div>
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          placeholder="Buscar por nombre o SKU"
          className="rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
        />
        <select
          value={categoryId ?? ""}
          onChange={(e) => {
            setCategoryId(e.target.value || null);
            setPage(0);
          }}
          className="rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-emerald-400"
        >
          <option value="">Todas las categorías</option>
          {(categories ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <ProductsTable
        products={data?.products ?? []}
        loading={isLoading}
        onEdit={(p) => {
          setEditingProduct(p);
          setFormOpen(true);
        }}
        onDeactivate={handleDeactivate}
      />

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2 text-sm">
          <button
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-lg px-3 py-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="text-slate-500">
            Página {page + 1} de {totalPages}
          </span>
          <button
            disabled={page + 1 >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg px-3 py-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-40"
          >
            Siguiente
          </button>
        </div>
      )}

      {formOpen && (
        <ProductForm
          product={editingProduct}
          onSubmit={handleSubmit}
          onClose={() => {
            setFormOpen(false);
            setEditingProduct(null);
          }}
          submitting={createProduct.isPending || updateProduct.isPending}
        />
      )}
    </div>
  );
}
