import { useState } from "react";
import { Lock } from "lucide-react";
import { useCashRegisters, useOpenShift, useOpenShiftMutation } from "@/modules/pos/hooks/usePos";
import type { CashShift } from "@/shared/types/pos";

interface CashShiftGateProps {
  storeId: string;
  children: (shift: CashShift, cashRegisterId: string) => React.ReactNode;
}

export function CashShiftGate({ storeId, children }: CashShiftGateProps) {
  const { data: registers, isLoading: loadingRegisters } = useCashRegisters(storeId);
  const [selectedRegisterId, setSelectedRegisterId] = useState<string | null>(null);
  const registerId = selectedRegisterId ?? registers?.[0]?.id ?? null;

  const { data: shift, isLoading: loadingShift } = useOpenShift(registerId);
  const openShiftMutation = useOpenShiftMutation();
  const [openingAmount, setOpeningAmount] = useState("0");

  if (loadingRegisters || (registerId && loadingShift)) {
    return <div className="flex h-full items-center justify-center text-slate-400">Cargando caja...</div>;
  }

  if (!registers || registers.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-400">
        <Lock className="h-8 w-8" />
        <p>No hay cajas registradas para esta tienda.</p>
      </div>
    );
  }

  if (shift) {
    return <>{children(shift, registerId as string)}</>;
  }

  const handleOpen = async () => {
    if (!registerId) return;
    await openShiftMutation.mutateAsync({
      cashRegisterId: registerId,
      openingAmount: Number(openingAmount) || 0,
    });
  };

  return (
    <div className="flex h-full items-center justify-center">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 p-6 text-center">
        <Lock className="mx-auto mb-3 h-8 w-8 text-slate-300" />
        <h2 className="text-lg font-bold text-slate-900">Abrir turno de caja</h2>
        <p className="mt-1 text-sm text-slate-500">
          Necesitas abrir un turno antes de registrar ventas.
        </p>

        {registers.length > 1 && (
          <select
            value={registerId ?? ""}
            onChange={(e) => setSelectedRegisterId(e.target.value)}
            className="mt-4 w-full rounded-xl border border-slate-200 px-3 py-2"
          >
            {registers.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        )}

        <label className="mt-4 block text-left text-xs font-semibold uppercase text-slate-500">
          Monto inicial en caja
        </label>
        <input
          type="number"
          step="0.01"
          value={openingAmount}
          onChange={(e) => setOpeningAmount(e.target.value)}
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-lg font-semibold outline-none focus:border-emerald-400"
        />

        <button
          onClick={handleOpen}
          disabled={openShiftMutation.isPending}
          className="mt-4 w-full rounded-xl bg-emerald-400 py-3 font-bold text-black hover:bg-emerald-300 disabled:opacity-60"
        >
          {openShiftMutation.isPending ? "Abriendo..." : "Abrir turno"}
        </button>

        {openShiftMutation.isError && (
          <p className="mt-2 text-sm text-rose-500">
            {(openShiftMutation.error as Error).message}
          </p>
        )}
      </div>
    </div>
  );
}
