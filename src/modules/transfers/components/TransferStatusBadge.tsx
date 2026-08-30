import { TRANSFER_STATUS_COLORS, TRANSFER_STATUS_LABELS, type TransferStatus } from "@/shared/types/transfers";

export function TransferStatusBadge({ status }: { status: TransferStatus }) {
  return (
    <span
      className={
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold " +
        TRANSFER_STATUS_COLORS[status]
      }
    >
      {TRANSFER_STATUS_LABELS[status]}
    </span>
  );
}
