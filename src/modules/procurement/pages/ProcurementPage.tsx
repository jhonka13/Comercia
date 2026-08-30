import { useState } from "react";
import { Bell, ShoppingBag } from "lucide-react";
import { LowStockAlertsPanel } from "@/modules/procurement/components/LowStockAlertsPanel";
import { PurchaseSuggestionsView } from "@/modules/procurement/components/PurchaseSuggestionsView";

interface ProcurementPageProps {
  storeId: string;
}

type Tab = "alerts" | "suggestions";

export function ProcurementPage({ storeId }: ProcurementPageProps) {
  const [tab, setTab] = useState<Tab>("suggestions");

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Abastecimiento</h1>

      <div className="mb-6 flex gap-1 rounded-xl bg-slate-100 p-1">
        <button
          onClick={() => setTab("suggestions")}
          className={
            "flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition " +
            (tab === "suggestions" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")
          }
        >
          <ShoppingBag className="h-4 w-4" />
          Sugerencias de compra
        </button>
        <button
          onClick={() => setTab("alerts")}
          className={
            "flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition " +
            (tab === "alerts" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")
          }
        >
          <Bell className="h-4 w-4" />
          Alertas de stock
        </button>
      </div>

      {tab === "suggestions" && <PurchaseSuggestionsView storeId={storeId} />}
      {tab === "alerts" && (
        <div className="max-w-md">
          <LowStockAlertsPanel storeId={storeId} />
        </div>
      )}
    </div>
  );
}
