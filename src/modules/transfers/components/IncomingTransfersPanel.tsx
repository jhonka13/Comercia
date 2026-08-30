import { useState } from "react";
import { Truck } from "lucide-react";
import { ReceiveTransferModal } from "@/modules/transfers/components/ReceiveTransferModal";
import { useIncomingTransfers } from "@/modules/transfers/hooks/useTransfers";
import type { StockTransferWithRelations } from "@/shared/types/transfers";

export function IncomingTransfersPanel({ storeId }: { storeId: string }) {
  const { data: transfers, isLoading } = useIncomingTransfers(storeId);
  const [receiving, setReceiving] = useState<StockTransferWithRelations | null>(null);

  if (isLoading) return <p className="text-sm text-slate-400">Cargando traslados en tránsito...</p>;

  if (!transfers || transfers.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 py-12 text-center text-slate-400">
        <Truck className="mx-auto mb-2 h-8 w-8" />
        <p>No hay mercancía en tránsito hacia esta tienda por el momento.</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {transfers.map((transfer) => (
          <div key={transfer.id} className="flex items-center justify-between rounded-xl border border-amber-100 bg-amber-50/50 p-4">
            <div>
              <p className="font-medium text-slate-900">Desde {transfer.origin_store.name}</p>
              <p className="text-xs text-slate-500">
                {transfer.items.length} producto(s) · despachado el{" "}
                {new Date(transfer.dispatched_at ?? transfer.created_at).toLocaleDateString()}
              </p>
            </div>
            <button
              onClick={() => setReceiving(transfer)}
              className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-black hover:bg-emerald-300"
            >
              Recibir mercancía
            </button>
          </div>
        ))}
      </div>

      {receiving && <ReceiveTransferModal transfer={receiving} onClose={() => setReceiving(null)} />}
    </>
  );
}
