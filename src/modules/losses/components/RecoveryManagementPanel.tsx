import { useState } from "react";
import { CheckCircle2, ClipboardCheck, XCircle } from "lucide-react";
import { usePendingRecoveries, useResolveLossRecovery } from "@/modules/losses/hooks/useLosses";
import { RECOVERY_METHOD_LABELS } from "@/shared/types/losses";
import type { LossRecoveryDetail, RecoveryMethod } from "@/shared/types/losses";

interface RecoveryManagementPanelProps {
  storeId: string;
  /** solo supervisor/store_admin/superadmin puede resolver — el backend también lo valida */
  canResolve: boolean;
}

export function RecoveryManagementPanel({ storeId, canResolve }: RecoveryManagementPanelProps) {
  const { data: pending, isLoading } = usePendingRecoveries(storeId);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  if (isLoading) return <p className="py-8 text-center text-slate-400">Cargando...</p>;

  if (!pending || pending.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-slate-300">
        No hay reintegros pendientes con proveedores.
      </p>
    );
  }

  const totalPending = pending.reduce((sum, r) => sum + r.loss_value, 0);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between rounded-xl bg-amber-50 px-4 py-3">
        <span className="text-sm font-medium text-amber-700">
          {pending.length} merma(s) en gestión con proveedores
        </span>
        <span className="text-lg font-bold text-amber-700">${totalPending.toFixed(2)}</span>
      </div>

      <div className="space-y-3">
        {pending.map((recovery) => (
          <RecoveryRow
            key={recovery.loss_id}
            recovery={recovery}
            storeId={storeId}
            canResolve={canResolve}
            resolving={resolvingId === recovery.loss_id}
            onStartResolve={() => setResolvingId(recovery.loss_id)}
            onCancelResolve={() => setResolvingId(null)}
          />
        ))}
      </div>
    </div>
  );
}

function RecoveryRow({
  recovery,
  storeId,
  canResolve,
  resolving,
  onStartResolve,
  onCancelResolve,
}: {
  recovery: LossRecoveryDetail;
  storeId: string;
  canResolve: boolean;
  resolving: boolean;
  onStartResolve: () => void;
  onCancelResolve: () => void;
}) {
  const resolve = useResolveLossRecovery(storeId);
  const [method, setMethod] = useState<RecoveryMethod>("credit_note");
  const [amount, setAmount] = useState("");
  const [quantityReplaced, setQuantityReplaced] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setError(null);
    if (method === "replacement" && !quantityReplaced) {
      setError("Indica cuántas unidades repuso el proveedor.");
      return;
    }
    if ((method === "credit_note" || method === "refund") && !amount) {
      setError("Indica el valor recuperado.");
      return;
    }
    try {
      await resolve.mutateAsync({
        lossId: recovery.loss_id,
        status: "confirmed",
        method,
        amount: Number(amount) || 0,
        quantityReplaced: Number(quantityReplaced) || 0,
        notes: notes || null,
      });
      onCancelResolve();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDeny = async () => {
    setError(null);
    try {
      await resolve.mutateAsync({
        lossId: recovery.loss_id,
        status: "denied",
        notes: notes || null,
      });
      onCancelResolve();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-medium text-slate-900">{recovery.product_name}</p>
          <p className="text-xs text-slate-400">
            {recovery.sku} · {recovery.quantity} u. · {recovery.supplier_name}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Registrado el {new Date(recovery.created_at).toLocaleDateString()}
          </p>
        </div>
        <p className="shrink-0 font-bold text-slate-900">${recovery.loss_value.toFixed(2)}</p>
      </div>

      {canResolve && !resolving && (
        <button
          onClick={onStartResolve}
          className="mt-3 flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
        >
          <ClipboardCheck className="h-3.5 w-3.5" />
          Registrar resolución
        </button>
      )}

      {canResolve && resolving && (
        <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
              Forma de recuperación
            </label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as RecoveryMethod)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-400"
            >
              {(Object.entries(RECOVERY_METHOD_LABELS) as [RecoveryMethod, string][]).map(
                ([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                )
              )}
            </select>
          </div>

          {method === "replacement" ? (
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                Unidades repuestas
              </label>
              <input
                type="number"
                min={0}
                value={quantityReplaced}
                onChange={(e) => setQuantityReplaced(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400"
              />
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                Valor recuperado
              </label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400"
              />
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
              Notas (opcional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej. número de nota crédito, guía de reposición..."
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400"
            />
          </div>

          {error && <p className="text-sm text-rose-500">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              onClick={onCancelResolve}
              className="flex-1 rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleDeny}
              disabled={resolve.isPending}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-60"
            >
              <XCircle className="h-4 w-4" />
              Negado
            </button>
            <button
              onClick={handleConfirm}
              disabled={resolve.isPending}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-60"
            >
              <CheckCircle2 className="h-4 w-4" />
              Confirmar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
