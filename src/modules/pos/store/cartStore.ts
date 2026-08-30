import { create } from "zustand";
import type { CartLine, CustomerSummary } from "@/shared/types/pos";
import { isFractionalUnit } from "@/shared/types/pos";
import type { ProductWithRelations } from "@/shared/types/catalog";

/** Incremento del botón +/- : 1 unidad para productos discretos, 100g/100ml para fraccionados */
function stepFor(unitCode: string | null) {
  return isFractionalUnit(unitCode) ? 0.1 : 1;
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

interface CartState {
  lines: CartLine[];
  discountPercent: number;
  customer: CustomerSummary | null;

  addProduct: (product: ProductWithRelations, availableStock: number) => void;
  incrementLine: (productId: string) => void;
  decrementLine: (productId: string) => void;
  setLineQuantity: (productId: string, quantity: number) => void;
  /** Edición directa del precio unitario desde la grilla estilo Excel (ej. precio especial en caja) */
  setLineUnitPrice: (productId: string, unitPrice: number) => void;
  removeLine: (productId: string) => void;
  setDiscountPercent: (pct: number) => void;
  setCustomer: (customer: CustomerSummary | null) => void;
  clear: () => void;
}

export const useCartStore = create<CartState>((set, get) => ({
  lines: [],
  discountPercent: 0,
  customer: null,

  addProduct: (product, availableStock) => {
    const existing = get().lines.find((l) => l.productId === product.id);
    if (existing) {
      get().incrementLine(product.id);
      return;
    }
    if (availableStock <= 0) return; // no permite agregar productos sin stock

    const unitCode = product.unit?.code ?? null;
    const newLine: CartLine = {
      productId: product.id,
      name: product.name,
      sku: product.sku,
      unitPrice: product.sale_price,
      taxRate: product.tax?.rate ?? 0,
      // Los productos a granel arrancan en el incremento más chico manejable
      // (100g / 100ml) en vez de "1 unidad completa", que normalmente no
      // corresponde a lo que el cliente pide en mostrador.
      quantity: isFractionalUnit(unitCode) ? Math.min(0.1, availableStock) : 1,
      availableStock,
      unitCode,
    };
    set({ lines: [...get().lines, newLine] });
  },

  incrementLine: (productId) =>
    set({
      lines: get().lines.map((l) => {
        if (l.productId !== productId) return l;
        const next = round3(l.quantity + stepFor(l.unitCode));
        return next <= l.availableStock ? { ...l, quantity: next } : l;
      }),
    }),

  decrementLine: (productId) =>
    set({
      lines: get()
        .lines.map((l) =>
          l.productId === productId
            ? { ...l, quantity: round3(l.quantity - stepFor(l.unitCode)) }
            : l
        )
        .filter((l) => l.quantity > 0),
    }),

  setLineQuantity: (productId, quantity) =>
    set({
      lines: get()
        .lines.map((l) =>
          l.productId === productId
            ? { ...l, quantity: round3(Math.min(Math.max(quantity, 0), l.availableStock)) }
            : l
        )
        .filter((l) => l.quantity > 0),
    }),

  setLineUnitPrice: (productId, unitPrice) =>
    set({
      lines: get().lines.map((l) =>
        l.productId === productId ? { ...l, unitPrice: Math.max(unitPrice, 0) } : l
      ),
    }),

  removeLine: (productId) =>
    set({ lines: get().lines.filter((l) => l.productId !== productId) }),

  setDiscountPercent: (pct) => set({ discountPercent: Math.min(Math.max(pct, 0), 100) }),

  setCustomer: (customer) => set({ customer }),

  clear: () => set({ lines: [], discountPercent: 0, customer: null }),
}));
