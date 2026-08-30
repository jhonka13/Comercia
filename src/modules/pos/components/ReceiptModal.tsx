import { useState } from "react";
import { CheckCircle2, Printer } from "lucide-react";
import { ThermalReceipt } from "@/modules/pos/components/ThermalReceipt";
import type { ReceiptData } from "@/shared/types/pos";

interface ReceiptModalProps {
  receipt: ReceiptData;
  onNewSale: () => void;
}

/**
 * `@media print` deja visible únicamente `#thermal-receipt` — así el botón
 * "Nueva venta", el selector de papel y el resto de la interfaz del POS no
 * salen impresos, sin necesidad de una ventana/pestaña aparte.
 */
export function ReceiptModal({ receipt, onNewSale }: ReceiptModalProps) {
  const [paperWidth, setPaperWidth] = useState<"58mm" | "80mm">("80mm");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 print:static print:bg-transparent print:p-0">
      <style>{`
        @media print {
          @page { margin: 0; size: ${paperWidth} auto; }
          body * { visibility: hidden; }
          #thermal-receipt, #thermal-receipt * { visibility: visible; }
          #thermal-receipt { position: absolute; top: 0; left: 0; }
        }
      `}</style>

      <div className="flex max-h-[90vh] w-full max-w-sm flex-col overflow-hidden rounded-2xl bg-white shadow-2xl print:max-h-none print:w-auto print:rounded-none print:shadow-none">
        <div className="flex items-center gap-2 border-b border-slate-100 px-6 py-4 text-center print:hidden">
          <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-500" />
          <div>
            <h3 className="font-bold text-slate-900">Venta registrada</h3>
            <p className="text-lg font-bold text-emerald-600">${receipt.totals.total.toFixed(2)}</p>
          </div>
        </div>

        <div className="flex items-center justify-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2 print:hidden">
          <span className="text-xs font-medium text-slate-500">Papel:</span>
          {(["58mm", "80mm"] as const).map((w) => (
            <button
              key={w}
              onClick={() => setPaperWidth(w)}
              className={
                "rounded-full px-3 py-1 text-xs font-semibold transition " +
                (paperWidth === w
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-500 hover:bg-slate-100")
              }
            >
              {w}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-auto bg-slate-100 py-4 print:overflow-visible print:bg-transparent print:p-0">
          <ThermalReceipt data={receipt} paperWidth={paperWidth} />
        </div>

        <div className="flex gap-2 border-t border-slate-100 p-4 print:hidden">
          <button
            onClick={() => window.print()}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 py-3 font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Printer className="h-4 w-4" />
            Imprimir
          </button>
          <button
            onClick={onNewSale}
            className="flex-1 rounded-xl bg-slate-900 py-3 font-semibold text-white hover:bg-slate-800"
          >
            Nueva venta
          </button>
        </div>
      </div>
    </div>
  );
}
