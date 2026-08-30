import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/modules/inventory/api/catalogApi";
import type { ListProductsParams } from "@/modules/inventory/api/catalogApi";
import type { ProductFormValues } from "@/shared/types/catalog";

export function useProducts(params: ListProductsParams) {
  return useQuery({
    queryKey: ["products", params],
    queryFn: () => api.listProducts(params),
    placeholderData: (prev) => prev, // evita el parpadeo al paginar/filtrar
  });
}

export function useProduct(id: string | null) {
  return useQuery({
    queryKey: ["product", id],
    queryFn: () => api.getProduct(id as string),
    enabled: !!id,
  });
}

export function useProductByBarcode(barcode: string | null) {
  return useQuery({
    queryKey: ["product-by-barcode", barcode],
    queryFn: () => api.findProductByBarcode(barcode as string),
    enabled: !!barcode,
    retry: false,
  });
}

export function useCategories() {
  return useQuery({ queryKey: ["categories"], queryFn: api.listCategories });
}

export function useBrands() {
  return useQuery({ queryKey: ["brands"], queryFn: api.listBrands });
}

export function useUnits() {
  return useQuery({ queryKey: ["units"], queryFn: api.listUnits });
}

export function useTaxes() {
  return useQuery({ queryKey: ["taxes"], queryFn: api.listTaxes });
}

export function useCreateProduct(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (values: ProductFormValues) => api.createProduct(tenantId, values),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products"] }),
  });
}

export function useUpdateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id: string; values: ProductFormValues }) =>
      api.updateProduct(id, values),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["product", id] });
    },
  });
}

export function useDeactivateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deactivateProduct(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products"] }),
  });
}

export function useStockByProduct(productId: string | null) {
  return useQuery({
    queryKey: ["stock", productId],
    queryFn: () => api.getStockByProduct(productId as string),
    enabled: !!productId,
  });
}

export function useRegisterStockEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.registerManualStockEntry,
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["stock", variables.productId] });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
}
