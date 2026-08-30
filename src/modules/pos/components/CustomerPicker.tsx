import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { searchCustomers } from "@/modules/pos/api/posApi";
import type { CustomerSummary } from "@/shared/types/pos";

interface CustomerPickerProps {
  onSelect: (customer: CustomerSummary) => void;
  onClose: () => void;
}

export function CustomerPicker({ onSelect, onClose }: CustomerPickerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerSummary[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      setLoading(true);
      try {
        setResults(await searchCustomers(query));
      } finally {
        setLoading(false);
      }
    }, 300); // debounce
    return () => clearTimeout(timeout);
  }, [query]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-bold text-slate-900">Buscar cliente</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nombre, documento o teléfono..."
            className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 outline-none focus:border-emerald-400"
          />
        </div>

        <div className="mt-3 max-h-72 space-y-1 overflow-y-auto">
          {loading && <p className="py-4 text-center text-sm text-slate-400">Buscando...</p>}

          {!loading &&
            results.map((customer) => {
              const available = customer.credit_limit - customer.credit_balance;
              return (
                <button
                  key={customer.id}
                  onClick={() => onSelect(customer)}
                  className="flex w-full flex-col rounded-xl px-3 py-2 text-left hover:bg-slate-50"
                >
                  <span className="font-medium text-slate-900">{customer.full_name}</span>
                  <span className="text-xs text-slate-400">
                    {customer.document_id ?? "Sin documento"} · Cupo disponible: $
                    {available.toFixed(2)} · {customer.loyalty_points} pts
                  </span>
                </button>
              );
            })}

          {!loading && query && results.length === 0 && (
            <p className="py-4 text-center text-sm text-slate-400">Sin coincidencias.</p>
          )}
        </div>
      </div>
    </div>
  );
}
