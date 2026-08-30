import { useEffect, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import type { ProductFormValues, ProductWithRelations } from "@/shared/types/catalog";
import { emptyProductForm } from "@/shared/types/catalog";
import { useBrands, useCategories, useTaxes, useUnits } from "@/modules/inventory/hooks/useProducts";
import {
  deleteProductImage,
  uploadProductImage,
} from "@/modules/inventory/api/catalogApi";
import { ProductImageUploader } from "@/modules/inventory/components/ProductImageUploader";

interface ProductFormProps {
  /** Si viene un producto, el formulario opera en modo edición */
  product?: ProductWithRelations | null;
  onSubmit: (values: ProductFormValues) => Promise<void>;
  onClose: () => void;
  submitting?: boolean;
}

function toFormValues(product: ProductWithRelations): ProductFormValues {
  return {
    sku: product.sku,
    name: product.name,
    description: product.description ?? "",
    category_id: product.category_id,
    brand_id: product.brand_id,
    unit_id: product.unit_id,
    tax_id: product.tax_id,
    cost_price: product.cost_price,
    sale_price: product.sale_price,
    bulk_price: product.bulk_price,
    is_active: product.is_active,
    barcodes: product.barcodes.map((b) => b.barcode),
  };
}

export function ProductForm({ product, onSubmit, onClose, submitting }: ProductFormProps) {
  const [values, setValues] = useState<ProductFormValues>(
    product ? toFormValues(product) : emptyProductForm
  );
  const [barcodeDraft, setBarcodeDraft] = useState("");
  const [images, setImages] = useState(product?.images ?? []);
  const [uploadingImage, setUploadingImage] = useState(false);

  const { data: categories } = useCategories();
  const { data: brands } = useBrands();
  const { data: units } = useUnits();
  const { data: taxes } = useTaxes();

  useEffect(() => {
    setValues(product ? toFormValues(product) : emptyProductForm);
    setImages(product?.images ?? []);
  }, [product]);

  const margin =
    values.sale_price > 0
      ? (((values.sale_price - values.cost_price) / values.sale_price) * 100).toFixed(1)
      : "0.0";

  const addBarcode = () => {
    const code = barcodeDraft.trim();
    if (!code || values.barcodes.includes(code)) return;
    setValues((v) => ({ ...v, barcodes: [...v.barcodes, code] }));
    setBarcodeDraft("");
  };

  const removeBarcode = (code: string) => {
    setValues((v) => ({ ...v, barcodes: v.barcodes.filter((b) => b !== code) }));
  };

  const handleImageUpload = async (file: File, isPrimary: boolean) => {
    if (!product) return; // requiere que el producto ya exista (tiene id)
    setUploadingImage(true);
    try {
      await uploadProductImage(product.id, file, isPrimary);
      // Refresco simple: en la práctica, invalidar la query del producto
      // desde el componente padre tras el submit recarga esta lista.
      window.location.reload();
    } finally {
      setUploadingImage(false);
    }
  };

  const handleImageDelete = async (image: (typeof images)[number]) => {
    await deleteProductImage(image.id, image.storage_path);
    setImages((imgs) => imgs.filter((i) => i.id !== image.id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(values);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-6 py-4">
          <h2 className="text-lg font-bold text-slate-900">
            {product ? "Editar producto" : "Nuevo producto"}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 px-6 py-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                SKU
              </label>
              <input
                required
                value={values.sku}
                onChange={(e) => setValues((v) => ({ ...v, sku: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-emerald-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                Nombre
              </label>
              <input
                required
                value={values.name}
                onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-emerald-400"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
              Descripción
            </label>
            <textarea
              value={values.description}
              onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
              rows={2}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-emerald-400"
            />
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <SelectField
              label="Categoría"
              value={values.category_id}
              onChange={(v) => setValues((s) => ({ ...s, category_id: v }))}
              options={(categories ?? []).map((c) => ({ value: c.id, label: c.name }))}
            />
            <SelectField
              label="Marca"
              value={values.brand_id}
              onChange={(v) => setValues((s) => ({ ...s, brand_id: v }))}
              options={(brands ?? []).map((b) => ({ value: b.id, label: b.name }))}
            />
            <SelectField
              label="Unidad"
              value={values.unit_id}
              onChange={(v) => setValues((s) => ({ ...s, unit_id: v }))}
              options={(units ?? []).map((u) => ({ value: u.id, label: u.name }))}
            />
            <SelectField
              label="Impuesto"
              value={values.tax_id}
              onChange={(v) => setValues((s) => ({ ...s, tax_id: v }))}
              options={(taxes ?? []).map((t) => ({ value: t.id, label: t.name }))}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                Costo
              </label>
              <input
                type="number"
                step="0.01"
                min={0}
                value={values.cost_price}
                onChange={(e) =>
                  setValues((v) => ({ ...v, cost_price: Number(e.target.value) }))
                }
                className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-emerald-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                Precio venta
              </label>
              <input
                type="number"
                step="0.01"
                min={0}
                value={values.sale_price}
                onChange={(e) =>
                  setValues((v) => ({ ...v, sale_price: Number(e.target.value) }))
                }
                className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-emerald-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                Margen
              </label>
              <div className="flex h-[42px] items-center rounded-lg bg-emerald-50 px-3 font-semibold text-emerald-700">
                {margin}%
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
              Precio por volumen (opcional)
            </label>
            <input
              type="number"
              step="0.01"
              min={0}
              value={values.bulk_price ?? ""}
              onChange={(e) =>
                setValues((v) => ({
                  ...v,
                  bulk_price: e.target.value ? Number(e.target.value) : null,
                }))
              }
              className="w-full max-w-xs rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-emerald-400"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
              Códigos de barras
            </label>
            <div className="flex gap-2">
              <input
                value={barcodeDraft}
                onChange={(e) => setBarcodeDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addBarcode();
                  }
                }}
                placeholder="Escanea o escribe y presiona Enter"
                className="flex-1 rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-emerald-400"
              />
              <button
                type="button"
                onClick={addBarcode}
                className="rounded-lg bg-slate-100 px-3 text-slate-600 hover:bg-slate-200"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            {values.barcodes.length > 0 && (
              <ul className="mt-2 space-y-1">
                {values.barcodes.map((code, i) => (
                  <li
                    key={code}
                    className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-sm"
                  >
                    <span className="font-mono">
                      {code} {i === 0 && <span className="text-emerald-600">(principal)</span>}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeBarcode(code)}
                      className="text-slate-400 hover:text-rose-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {product && (
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                Imágenes
              </label>
              <ProductImageUploader
                images={images}
                onUpload={handleImageUpload}
                onDelete={handleImageDelete}
                uploading={uploadingImage}
              />
            </div>
          )}
          {!product && (
            <p className="text-xs text-slate-400">
              Guarda el producto primero para poder cargar imágenes.
            </p>
          )}

          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={values.is_active}
              onChange={(e) => setValues((v) => ({ ...v, is_active: e.target.checked }))}
              className="h-4 w-4 accent-emerald-500"
            />
            Producto activo (visible en POS)
          </label>

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
              disabled={submitting}
              className="rounded-lg bg-emerald-400 px-5 py-2 font-semibold text-black hover:bg-emerald-300 disabled:opacity-60"
            >
              {submitting ? "Guardando..." : "Guardar producto"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">{label}</label>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 outline-none focus:border-emerald-400"
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
