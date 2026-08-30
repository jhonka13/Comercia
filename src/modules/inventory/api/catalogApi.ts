import { supabase } from "@/shared/lib/supabaseClient";
import type {
  Brand,
  Category,
  InventoryStockWithStore,
  ProductFormValues,
  ProductWithRelations,
  Tax,
  UnitOfMeasure,
} from "@/shared/types/catalog";

// RLS (tenant_isolation_products, etc.) filtra automáticamente por el tenant
// del usuario autenticado — nunca hace falta pasar tenant_id manualmente en
// estas queries, salvo en los inserts (donde sí es obligatorio).

const PRODUCT_SELECT = `
  id, tenant_id, sku, name, description, category_id, brand_id, unit_id, tax_id,
  cost_price, sale_price, bulk_price, is_active, created_at,
  category:categories ( id, name ),
  brand:brands ( id, name ),
  unit:units_of_measure ( id, code, name ),
  tax:taxes ( id, name, rate ),
  barcodes:product_barcodes ( id, barcode, is_primary ),
  images:product_images ( id, storage_path, is_primary )
`;

export interface ListProductsParams {
  search?: string; // busca por nombre o SKU
  categoryId?: string | null;
  onlyActive?: boolean;
  page?: number; // 0-indexed
  pageSize?: number;
}

export async function listProducts({
  search = "",
  categoryId = null,
  onlyActive = true,
  page = 0,
  pageSize = 25,
}: ListProductsParams) {
  let query = supabase
    .from("products")
    .select(PRODUCT_SELECT, { count: "exact" })
    .order("name", { ascending: true })
    .range(page * pageSize, page * pageSize + pageSize - 1);

  if (search.trim()) {
    query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%`);
  }
  if (categoryId) {
    query = query.eq("category_id", categoryId);
  }
  if (onlyActive) {
    query = query.eq("is_active", true);
  }

  const { data, error, count } = await query;
  if (error) throw error;

  const products = (data ?? []) as unknown as ProductWithRelations[];

  // Stock total por producto (sumado entre todas las tiendas del tenant).
  // Se resuelve en una segunda query en vez de un join porque Postgrest no
  // agrega (SUM) dentro de un select anidado.
  if (products.length > 0) {
    const { data: stockRows, error: stockError } = await supabase
      .from("inventory_stock")
      .select("product_id, quantity")
      .in("product_id", products.map((p) => p.id));
    if (stockError) throw stockError;

    const totals = new Map<string, number>();
    for (const row of stockRows ?? []) {
      totals.set(row.product_id, (totals.get(row.product_id) ?? 0) + row.quantity);
    }
    for (const product of products) {
      product.total_stock = totals.get(product.id) ?? 0;
    }
  }

  return { products, total: count ?? 0 };
}

/** Búsqueda puntual por código de barras — usada por el lector físico */
export async function findProductByBarcode(barcode: string) {
  const { data, error } = await supabase
    .from("product_barcodes")
    .select(`product:products ( ${PRODUCT_SELECT} )`)
    .eq("barcode", barcode.trim())
    .maybeSingle();

  if (error) throw error;
  return (data?.product ?? null) as unknown as ProductWithRelations | null;
}

export async function getProduct(id: string) {
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as unknown as ProductWithRelations;
}

/**
 * Crea un producto junto con sus códigos de barras en una operación.
 * `tenantId` se pasa explícito desde el `UserContext` resuelto en el login
 * (ver authContext.ts) — la política RLS `with check (tenant_id =
 * auth_tenant_id())` rechaza el insert si no coincide con el tenant real
 * del usuario, así que esto no es una vía de escape de seguridad, solo
 * evita una consulta adicional en cada insert.
 */
export async function createProduct(tenantId: string, values: ProductFormValues) {
  const { data: product, error } = await supabase
    .from("products")
    .insert({
      tenant_id: tenantId,
      sku: values.sku,
      name: values.name,
      description: values.description || null,
      category_id: values.category_id,
      brand_id: values.brand_id,
      unit_id: values.unit_id,
      tax_id: values.tax_id,
      cost_price: values.cost_price,
      sale_price: values.sale_price,
      bulk_price: values.bulk_price,
      is_active: values.is_active,
    })
    .select("id")
    .single();

  if (error) throw error;

  if (values.barcodes.length > 0) {
    const rows = values.barcodes
      .filter((b) => b.trim())
      .map((barcode, i) => ({ product_id: product.id, barcode, is_primary: i === 0 }));
    const { error: barcodeError } = await supabase.from("product_barcodes").insert(rows);
    if (barcodeError) throw barcodeError;
  }

  return product.id as string;
}

export async function updateProduct(id: string, values: ProductFormValues) {
  const { error } = await supabase
    .from("products")
    .update({
      sku: values.sku,
      name: values.name,
      description: values.description || null,
      category_id: values.category_id,
      brand_id: values.brand_id,
      unit_id: values.unit_id,
      tax_id: values.tax_id,
      cost_price: values.cost_price,
      sale_price: values.sale_price,
      bulk_price: values.bulk_price,
      is_active: values.is_active,
    })
    .eq("id", id);
  if (error) throw error;

  // Reemplaza el set completo de códigos de barras (simple y predecible)
  const { error: deleteError } = await supabase
    .from("product_barcodes")
    .delete()
    .eq("product_id", id);
  if (deleteError) throw deleteError;

  const rows = values.barcodes
    .filter((b) => b.trim())
    .map((barcode, i) => ({ product_id: id, barcode, is_primary: i === 0 }));
  if (rows.length > 0) {
    const { error: insertError } = await supabase.from("product_barcodes").insert(rows);
    if (insertError) throw insertError;
  }
}

/** Baja lógica — nunca se borra un producto con historial de ventas */
export async function deactivateProduct(id: string) {
  const { error } = await supabase.from("products").update({ is_active: false }).eq("id", id);
  if (error) throw error;
}

// ------------------------- Catálogos de apoyo -------------------------

export async function listCategories() {
  const { data, error } = await supabase.from("categories").select("*").order("name");
  if (error) throw error;
  return data as Category[];
}

export async function listBrands() {
  const { data, error } = await supabase.from("brands").select("*").order("name");
  if (error) throw error;
  return data as Brand[];
}

export async function listUnits() {
  const { data, error } = await supabase.from("units_of_measure").select("*").order("name");
  if (error) throw error;
  return data as UnitOfMeasure[];
}

export async function listTaxes() {
  const { data, error } = await supabase.from("taxes").select("*").order("name");
  if (error) throw error;
  return data as Tax[];
}

// ------------------------- Imágenes de producto -------------------------

const IMAGES_BUCKET = "product-images";

export async function uploadProductImage(productId: string, file: File, isPrimary: boolean) {
  const ext = file.name.split(".").pop();
  const path = `${productId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from(IMAGES_BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { error: insertError } = await supabase
    .from("product_images")
    .insert({ product_id: productId, storage_path: path, is_primary: isPrimary });
  if (insertError) throw insertError;

  return path;
}

export function getProductImageUrl(storagePath: string) {
  return supabase.storage.from(IMAGES_BUCKET).getPublicUrl(storagePath).data.publicUrl;
}

export async function deleteProductImage(imageId: string, storagePath: string) {
  const { error: storageError } = await supabase.storage.from(IMAGES_BUCKET).remove([storagePath]);
  if (storageError) throw storageError;
  const { error: dbError } = await supabase.from("product_images").delete().eq("id", imageId);
  if (dbError) throw dbError;
}

// ------------------------- Inventario -------------------------

export async function getStockByProduct(productId: string) {
  const { data, error } = await supabase
    .from("inventory_stock")
    .select("id, tenant_id, product_id, store_id, quantity, min_quantity, updated_at, store:stores ( id, name )")
    .eq("product_id", productId);
  if (error) throw error;
  return data as unknown as InventoryStockWithStore[];
}

/**
 * Entrada manual de inventario (recepción de mercancía sin orden de compra
 * formal, o ajuste rápido desde el buscador de código de barras).
 * Actualiza `inventory_stock` (upsert) y deja rastro en `stock_movements`,
 * consistente con el patrón de auditoría del esquema.
 */
export async function registerManualStockEntry(params: {
  tenantId: string;
  productId: string;
  storeId: string;
  quantity: number; // siempre positivo: esto es una entrada
  performedBy: string;
}) {
  const { tenantId, productId, storeId, quantity, performedBy } = params;
  if (quantity <= 0) throw new Error("La cantidad de entrada debe ser mayor a cero.");

  const { data: existing, error: fetchError } = await supabase
    .from("inventory_stock")
    .select("id, quantity")
    .eq("product_id", productId)
    .eq("store_id", storeId)
    .maybeSingle();
  if (fetchError) throw fetchError;

  if (existing) {
    const { error: updateError } = await supabase
      .from("inventory_stock")
      .update({ quantity: existing.quantity + quantity, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (updateError) throw updateError;
  } else {
    const { error: insertError } = await supabase.from("inventory_stock").insert({
      tenant_id: tenantId,
      product_id: productId,
      store_id: storeId,
      quantity,
    });
    if (insertError) throw insertError;
  }

  const { error: movementError } = await supabase.from("stock_movements").insert({
    tenant_id: tenantId,
    product_id: productId,
    store_id: storeId,
    movement_type: "purchase_in",
    quantity,
    performed_by: performedBy,
  });
  if (movementError) throw movementError;
}
