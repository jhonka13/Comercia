import { useState } from "react";
import { Banknote, CreditCard, HandCoins, Landmark, X } from "lucide-react";
import type { CartTotals } from "@/shared/types/pos";
import type { PaymentMethod, SalePaymentInput, CustomerSummary } from "@/shared/types/pos";

interface PaymentModalProps {
  totals: CartTotals;
  customer: CustomerSummary | null;
  onRequestCustomer: () => void;
  onConfirm: (payments: SalePaymentInput[]) => void;
  onClose: () => void;
  processing?: boolean;
  errorMessage?: string | null;
}

const METHODS: { value: PaymentMethod; label: string; icon: typeof Banknote }[] = [
  { value: "cash", label: "Efectivo", icon: Banknote },
  { value: "card", label: "Tarjeta", icon: CreditCard },
  { value: "transfer", label: "Transferencia", icon: Landmark },
  { value: "credit", label: "Fiado", icon: HandCoins },
];

const CASH_QUICK_ADDS = [0, 5, 10, 20, 50];

export function PaymentModal({
  totals,
  customer,
  onRequestCustomer,
  onConfirm,
  onClose,
  processing,
  errorMessage,
}: PaymentModalProps) {
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [cashReceived, setCashReceived] = useState(totals.total.toFixed(2));

  const received = Number(cashReceived) || 0;
  const change = Math.max(0, received - totals.total);
  const cashInsufficient = method === "cash" && received < totals.total;

  const availableCredit = customer ? customer.credit_limit - customer.credit_balance : 0;
  const creditInsufficient = method === "credit" && availableCredit < totals.total;

  const canConfirm =
    !processing &&
    !(method === "cash" && cashInsufficient) &&
    !(method === "credit" && (!customer || creditInsufficient));

  const handleConfirm = () => {
    let payments: SalePaymentInput[];

    if (method === "cash") {
      payments = [{ method: "cash", amount: received, change_given: change }];
    } else if (method === "credit") {
      payments = [{ method: "credit", amount: totals.total, change_given: 0 }];
    } else {
      payments = [{ method, amount: totals.total, change_given: 0 }];
    }

    onConfirm(payments);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-bold text-slate-900">Cobrar</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-5">
          <p className="text-center text-3xl font-bold text-slate-900">${totals.total.toFixed(2)}</p>

          <div className="mt-5 grid grid-cols-4 gap-2">
            {METHODS.map((m) => (
              <button
                key={m.value}
                onClick={() => setMethod(m.value)}
                className={
                  "flex flex-col items-center gap-1 rounded-xl border py-3 text-xs font-medium transition " +
                  (method === m.value
                    ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 text-slate-500 hover:border-slate-300")
                }
              >
                <m.icon className="h-5 w-5" />
                {m.label}
              </button>
            ))}
          </div>

          {method === "cash" && (
            <div className="mt-5">
              <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                Monto recibido
              </label>
              <input
                type="number"
                step="0.01"
                autoFocus
                value={cashReceived}
                onChange={(e) => setCashReceived(e.target.value)}
                className={
                  "w-full rounded-xl border px-4 py-3 text-xl font-bold outline-none " +
                  (cashInsufficient
                    ? "border-rose-300 focus:border-rose-400"
                    : "border-slate-200 focus:border-emerald-400")
                }
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {CASH_QUICK_ADDS.map((amount) => (
                  <button
                    key={amount}
                    onClick={() =>
                      setCashReceived(
                        (amount === 0 ? totals.total : totals.total + amount).toFixed(2)
                      )
                    }
                    className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-200"
                  >
                    {amount === 0 ? "Exacto" : `+$${amount}`}
                  </button>
                ))}
              </div>

              <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                <span className="text-sm text-slate-500">Cambio a entregar</span>
                <span className="text-xl font-bold text-emerald-600">${change.toFixed(2)}</span>
              </div>
              {cashInsufficient && (
                <p className="mt-2 text-sm text-rose-500">
                  El monto recibido es menor al total de la venta.
                </p>
              )}
            </div>
          )}

          {(method === "card" || method === "transfer") && (
            <div className="mt-5 rounded-xl bg-slate-50 px-4 py-4 text-center text-sm text-slate-500">
              Confirma en tu datáfono/plataforma el cobro de{" "}
              <span className="font-semibold text-slate-900">${totals.total.toFixed(2)}</span> y
              luego presiona "Confirmar pago".
            </div>
          )}

          {method === "credit" && (
            <div className="mt-5">
              {!customer ? (
                <button
                  onClick={onRequestCustomer}
                  className="w-full rounded-xl border border-dashed border-slate-300 py-3 text-sm text-slate-500 hover:border-emerald-300"
                >
                  Selecciona un cliente para vender a crédito
                </button>
              ) : (
                <div className="rounded-xl bg-slate-50 px-4 py-3">
                  <p className="font-medium text-slate-900">{customer.full_name}</p>
                  <p className="text-sm text-slate-500">
                    Cupo disponible: ${availableCredit.toFixed(2)}
                  </p>
                  {creditInsufficient && (
                    <p className="mt-1 text-sm text-rose-500">
                      El cupo disponible no alcanza para cubrir esta venta.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {errorMessage && (
            <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">
              {errorMessage}
            </p>
          )}

          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="mt-5 w-full rounded-xl bg-emerald-400 py-3.5 font-bold text-black transition hover:bg-emerald-300 disabled:opacity-40"
          >
            {processing ? "Procesando..." : "Confirmar pago"}
          </button>
        </div>
      </div>
    </div>
  );
}
