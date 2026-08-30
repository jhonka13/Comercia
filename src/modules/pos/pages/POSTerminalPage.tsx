import { useState } from "react";
import { LogOut } from "lucide-react";
import { CashShiftGate } from "@/modules/pos/components/CashShiftGate";
import { ProductSearchPanel } from "@/modules/pos/components/ProductSearchPanel";
import { CartPanel } from "@/modules/pos/components/CartPanel";
import { PaymentModal } from "@/modules/pos/components/PaymentModal";
import { CustomerPicker } from "@/modules/pos/components/CustomerPicker";
import { ReceiptModal } from "@/modules/pos/components/ReceiptModal";
import { useCartStore } from "@/modules/pos/store/cartStore";
import { computeCartTotals } from "@/modules/pos/lib/cartMath";
import {
  useCloseShiftMutation,
  useProcessSale,
  useReceiptContext,
  useStoreStock,
} from "@/modules/pos/hooks/usePos";
import type { CashShift, ReceiptData, SalePaymentInput } from "@/shared/types/pos";

interface POSTerminalPageProps {
  storeId: string;
  cashierName: string;
}

export function POSTerminalPage({ storeId, cashierName }: POSTerminalPageProps) {
  return (
    <div className="h-screen bg-slate-50">
      <CashShiftGate storeId={storeId}>
        {(shift, cashRegisterId) => (
          <ActiveTerminal
            storeId={storeId}
            shift={shift}
            cashRegisterId={cashRegisterId}
            cashierName={cashierName}
          />
        )}
      </CashShiftGate>
    </div>
  );
}

function ActiveTerminal({
  storeId,
  shift,
  cashRegisterId,
  cashierName,
}: {
  storeId: string;
  shift: CashShift;
  cashRegisterId: string;
  cashierName: string;
}) {
  const [showPayment, setShowPayment] = useState(false);
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [showCloseShift, setShowCloseShift] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const { data: stockMap } = useStoreStock(storeId);
  const { data: receiptContext } = useReceiptContext(storeId);
  const lines = useCartStore((s) => s.lines);
  const discountPercent = useCartStore((s) => s.discountPercent);
  const customer = useCartStore((s) => s.customer);
  const setCustomer = useCartStore((s) => s.setCustomer);
  const clearCart = useCartStore((s) => s.clear);

  const processSale = useProcessSale(storeId);
  const totals = computeCartTotals(lines, discountPercent);

  const getStockFor = (productId: string) => stockMap?.[productId] ?? 0;

  const handleConfirmPayment = async (payments: SalePaymentInput[]) => {
    setPaymentError(null);
    try {
      const saleId = await processSale.mutateAsync({
        storeId,
        cashShiftId: shift.id,
        customerId: customer?.id ?? null,
        lines,
        discountPercent,
        payments,
      });
      setReceipt({
        saleId,
        createdAt: new Date().toISOString(),
        context: receiptContext ?? { businessName: "", storeName: "", storeAddress: null },
        cashierName,
        customerName: customer?.full_name ?? null,
        lines,
        discountPercent,
        totals,
        payments,
      });
      setShowPayment(false);
      clearCart();
    } catch (err) {
      setPaymentError((err as Error).message);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <div>
          <p className="font-semibold text-slate-900">{cashierName}</p>
          <p className="text-xs text-slate-400">
            Turno abierto desde {new Date(shift.opened_at).toLocaleTimeString()}
          </p>
        </div>
        <button
          onClick={() => setShowCloseShift(true)}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100"
        >
          <LogOut className="h-4 w-4" />
          Cerrar turno
        </button>
      </header>

      <div className="grid flex-1 grid-cols-1 gap-4 overflow-hidden p-4 lg:grid-cols-[1fr_380px]">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-4">
          <ProductSearchPanel getStockFor={getStockFor} />
        </div>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-4">
          <CartPanel
            onCheckout={() => setShowPayment(true)}
            onPickCustomer={() => setShowCustomerPicker(true)}
          />
        </div>
      </div>

      {showPayment && (
        <PaymentModal
          totals={totals}
          customer={customer}
          onRequestCustomer={() => setShowCustomerPicker(true)}
          onConfirm={handleConfirmPayment}
          onClose={() => setShowPayment(false)}
          processing={processSale.isPending}
          errorMessage={paymentError}
        />
      )}

      {showCustomerPicker && (
        <CustomerPicker
          onSelect={(c) => {
            setCustomer(c);
            setShowCustomerPicker(false);
          }}
          onClose={() => setShowCustomerPicker(false)}
        />
      )}

      {showCloseShift && (
        <CloseShiftModal
          shift={shift}
          cashRegisterId={cashRegisterId}
          onClose={() => setShowCloseShift(false)}
        />
      )}

      {receipt && <ReceiptModal receipt={receipt} onNewSale={() => setReceipt(null)} />}
    </div>
  );
}

function CloseShiftModal({
  shift,
  onClose,
}: {
  shift: CashShift;
  cashRegisterId: string;
  onClose: () => void;
}) {
  const [closingAmount, setClosingAmount] = useState("");
  const closeShift = useCloseShiftMutation();
  const [result, setResult] = useState<{ expected_amount: number; difference: number } | null>(null);

  const handleClose = async () => {
    const [row] = await closeShift.mutateAsync({
      shiftId: shift.id,
      closingAmount: Number(closingAmount) || 0,
    });
    setResult(row);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl">
        {!result ? (
          <>
            <h3 className="text-lg font-bold text-slate-900">Cerrar turno</h3>
            <p className="mt-1 text-sm text-slate-500">Cuenta el efectivo físico en caja</p>
            <input
              type="number"
              step="0.01"
              autoFocus
              value={closingAmount}
              onChange={(e) => setClosingAmount(e.target.value)}
              className="mt-4 w-full rounded-xl border border-slate-200 px-4 py-3 text-center text-xl font-bold outline-none focus:border-emerald-400"
              placeholder="0.00"
            />
            <div className="mt-4 flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 rounded-xl px-4 py-2.5 text-slate-500 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleClose}
                disabled={closeShift.isPending || !closingAmount}
                className="flex-1 rounded-xl bg-emerald-400 px-4 py-2.5 font-semibold text-black hover:bg-emerald-300 disabled:opacity-60"
              >
                {closeShift.isPending ? "Cerrando..." : "Confirmar cierre"}
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 className="text-lg font-bold text-slate-900">Turno cerrado</h3>
            <div className="mt-4 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Esperado en caja</span>
                <span className="font-medium">${result.expected_amount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Diferencia</span>
                <span
                  className={
                    "font-semibold " +
                    (Math.abs(result.difference) < 0.01
                      ? "text-emerald-600"
                      : result.difference < 0
                        ? "text-rose-500"
                        : "text-amber-500")
                  }
                >
                  {result.difference >= 0 ? "+" : ""}
                  {result.difference.toFixed(2)}
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="mt-5 w-full rounded-xl bg-slate-900 py-2.5 font-semibold text-white hover:bg-slate-800"
            >
              Cerrar
            </button>
          </>
        )}
      </div>
    </div>
  );
}
