import { useState } from "react";
import { X } from "lucide-react";
import { useReceiveTransfer } from "@/modules/transfers/hooks/useTransfers";
import type { ReceivedQuantities, StockTransferWithRelations } from "@/shared/types/transfers";

interface ReceiveTransferModalProps {
  transfer: StockTransferWithRelations;
  onClose: () => void;
}

export function ReceiveTransferModal({ transfer, onClose }: ReceiveTransferModalProps) {
  const receiveTransfer = useReceiveTransfer();
  const [error, setError] = useState<string | null>(null);

  const [quantities, setQuantities] = useState<ReceivedQuantities>(() =>
    Object.fromEntries(transfer.items.map((item) => [item.id, item.quantity_requested]))
  );

  const handleQuantityChange = (itemId: string, value: string, max: number) => {
    const parsed = Number(value);
    setQuantities((prev) => ({
      ...prev,
      [itemId]: Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), max) : 0,
    }));
  };

  const hasDiscrepancy = transfer.items.some(
    (item) => quantities[item.id] !== item.quantity_requested
  );

  const handleConfirm = async () => {
    setError(null);
    try {
      await receiveTransfer.mutateAsync({
        transferId: transfer.id,
        items: transfer.items.map((item) => ({
          itemId: item.id,
          quantityReceived: quantities[item.id],
        })),
      });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Confirmar recepción</h2>
            <p className="text-xs text-slate-500">Proviene de {transfer.origin_store.name}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-6 py-5">
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Ajusta la cantidad recibida si hubo faltantes o mercancía dañada en el traslado. El
            inventario de esta tienda se sumará solo por la cantidad confirmada aquí.
          </p>

          {transfer.items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2"
            >
              <div>
                <p className="text-sm font-medium text-slate-900">{item.product.name}</p>
                <p className="text-xs text-slate-500">Despachado: {item.quantity_requested} uds.</p>
              </div>
              <input
                type="number"
                min={0}
                max={item.quantity_requested}
                value={quantities[item.id]}
                onChange={(e) => handleQuantityChange(item.id, e.target.value, item.quantity_requested)}
                className="w-24 rounded-lg border border-slate-200 px-3 py-2 text-right outline-none focus:border-emerald-400"
              />
            </div>
          ))}

          {hasDiscrepancy && (
            <p className="text-xs text-amber-600">
              Hay diferencias con lo despachado — quedarán registradas en el traslado.
            </p>
          )}

          {error && <p className="text-sm text-rose-500">{error}</p>}
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-4">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-slate-500 hover:bg-slate-50">
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={receiveTransfer.isPending}
            className="rounded-lg bg-emerald-400 px-5 py-2 font-semibold text-black hover:bg-emerald-300 disabled:opacity-60"
          >
            {receiveTransfer.isPending ? "Confirmando..." : "Confirmar recepción"}
          </button>
        </div>
      </div>
    </div>
  );
}
