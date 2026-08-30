// Tipos alineados 1:1 con database/schema.sql (tablas de catálogo e inventario)

export interface Category {
  id: string;
  tenant_id: string;
  name: string;
  parent_id: string | null;
}

export interface Brand {
  id: string;
  tenant_id: string;
  name: string;
}

export interface UnitOfMeasure {
  id: string;
  tenant_id: string;
  code: string; // kg, lt, unidad, caja
  name: string;
}

export interface Tax {
  id: string;
  tenant_id: string;
  name: string; // "IVA 19%"
  rate: number;
}

export interface ProductBarcode {
  id: string;
  product_id: string;
  barcode: string;
  is_primary: boolean;
}

export interface ProductImage {
  id: string;
  product_id: string;
  storage_path: string;
  is_primary: boolean;
}

export interface Product {
  id: string;
  tenant_id: string;
  sku: string;
  name: string;
  description: string | null;
  category_id: string | null;
  brand_id: string | null;
  unit_id: string | null;
  tax_id: string | null;
  cost_price: number;
  sale_price: number;
  bulk_price: number | null;
  is_active: boolean;
  created_at: string;
}

/** Producto con sus relaciones expandidas, tal como lo devuelve el catálogo */
export interface ProductWithRelations extends Product {
  category: Pick<Category, "id" | "name"> | null;
  brand: Pick<Brand, "id" | "name"> | null;
  unit: Pick<UnitOfMeasure, "id" | "code" | "name"> | null;
  tax: Pick<Tax, "id" | "name" | "rate"> | null;
  barcodes: ProductBarcode[];
  images: ProductImage[];
  /** Suma de inventory_stock.quantity a través de todas las tiendas (calculado en la query) */
  total_stock?: number;
}

export interface InventoryStock {
  id: string;
  tenant_id: string;
  product_id: string;
  store_id: string;
  quantity: number;
  min_quantity: number;
  updated_at: string;
}

export interface InventoryStockWithStore extends InventoryStock {
  store: { id: string; name: string };
}

/** Payload para crear/editar un producto desde el formulario */
export interface ProductFormValues {
  sku: string;
  name: string;
  description: string;
  category_id: string | null;
  brand_id: string | null;
  unit_id: string | null;
  tax_id: string | null;
  cost_price: number;
  sale_price: number;
  bulk_price: number | null;
  barcodes: string[]; // el primero de la lista se marca is_primary
  is_active: boolean;
}

export const emptyProductForm: ProductFormValues = {
  sku: "",
  name: "",
  description: "",
  category_id: null,
  brand_id: null,
  unit_id: null,
  tax_id: null,
  cost_price: 0,
  sale_price: 0,
  bulk_price: null,
  barcodes: [],
  is_active: true,
};
