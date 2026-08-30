import { LossRecoveryReport } from "@/modules/finance/components/LossRecoveryReport";

interface FinancePageProps {
  storeId: string;
}

/**
 * Módulo de finanzas — arranca con el reporte de recuperación de mermas
 * (pérdida neta vs. gestión con proveedores) que pedía este ciclo de trabajo.
 * Métricas más amplias (flujo de caja consolidado, cuentas por pagar,
 * utilidad por categoría, etc.) quedan como siguiente iteración — ver README.
 */
export function FinancePage({ storeId }: FinancePageProps) {
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Finanzas</h1>
      <p className="mb-6 text-sm text-slate-500">
        Impacto financiero de mermas y recuperación con proveedores
      </p>
      <LossRecoveryReport storeId={storeId} />
    </div>
  );
}
