import { Package } from "lucide-react";
import { TransferStatusBadge } from "@/modules/transfers/components/TransferStatusBadge";
import { useCancelTransfer, useOutgoingTransfers } from "@/modules/transfers/hooks/useTransfers";

export function OutgoingTransfersPanel({ storeId }: { storeId: string }) {
  const { data: transfers, isLoading } = useOutgoingTransfers(storeId);
  const cancelTransfer = useCancelTransfer();

  if (isLoading) return <p className="text-sm text-slate-400">Cargando traslados...</p>;

  if (!transfers || transfers.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 py-12 text-center text-slate-400">
        <Package className="mx-auto mb-2 h-8 w-8" />
        <p>Aún no has despachado ningún traslado desde esta tienda.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {transfers.map((transfer) => (
        <div key={transfer.id} className="rounded-xl border border-slate-100 p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-medium text-slate-900">
                Hacia {transfer.destination_store.name}
              </p>
              <p className="text-xs text-slate-500">
                {transfer.items.length} producto(s) · despachado por {transfer.requester.full_name} el{" "}
                {new Date(transfer.dispatched_at ?? transfer.created_at).toLocaleDateString()}
              </p>
            </div>
            <TransferStatusBadge status={transfer.status} />
          </div>

          <ul className="mt-3 space-y-1 border-t border-slate-50 pt-3 text-sm text-slate-600">
            {transfer.items.map((item) => (
              <li key={item.id} className="flex justify-between">
                <span>{item.product.name}</span>
                <span className="text-slate-400">
                  {item.quantity_received ?? item.quantity_requested}/{item.quantity_requested} uds.
                </span>
              </li>
            ))}
          </ul>

          {transfer.status === "in_transit" && (
            <button
              onClick={() => cancelTransfer.mutate(transfer.id)}
              disabled={cancelTransfer.isPending}
              className="mt-3 text-xs font-medium text-rose-500 hover:underline disabled:opacity-60"
            >
              Cancelar traslado y devolver stock a esta tienda
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
