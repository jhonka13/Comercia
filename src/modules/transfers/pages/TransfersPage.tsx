import { useState } from "react";
import { PackagePlus, SendHorizonal, Truck } from "lucide-react";
import { CreateTransferModal } from "@/modules/transfers/components/CreateTransferModal";
import { IncomingTransfersPanel } from "@/modules/transfers/components/IncomingTransfersPanel";
import { OutgoingTransfersPanel } from "@/modules/transfers/components/OutgoingTransfersPanel";
import { useIncomingTransfers } from "@/modules/transfers/hooks/useTransfers";

interface TransfersPageProps {
  storeId: string;
}

type Tab = "incoming" | "outgoing";

export function TransfersPage({ storeId }: TransfersPageProps) {
  const [tab, setTab] = useState<Tab>("incoming");
  const [creating, setCreating] = useState(false);
  const { data: incoming } = useIncomingTransfers(storeId);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Traslados entre sucursales</h1>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 rounded-lg bg-emerald-400 px-4 py-2 font-semibold text-black hover:bg-emerald-300"
        >
          <PackagePlus className="h-4 w-4" />
          Nuevo traslado
        </button>
      </div>

      <div className="mb-6 flex gap-1 rounded-xl bg-slate-100 p-1">
        <button
          onClick={() => setTab("incoming")}
          className={
            "relative flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition " +
            (tab === "incoming" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")
          }
        >
          <Truck className="h-4 w-4" />
          Por recibir
          {!!incoming?.length && (
            <span className="rounded-full bg-amber-400 px-1.5 py-0.5 text-xs font-bold text-black">
              {incoming.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab("outgoing")}
          className={
            "flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition " +
            (tab === "outgoing" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")
          }
        >
          <SendHorizonal className="h-4 w-4" />
          Enviados
        </button>
      </div>

      {tab === "incoming" && <IncomingTransfersPanel storeId={storeId} />}
      {tab === "outgoing" && <OutgoingTransfersPanel storeId={storeId} />}

      {creating && <CreateTransferModal originStoreId={storeId} onClose={() => setCreating(false)} />}
    </div>
  );
}
