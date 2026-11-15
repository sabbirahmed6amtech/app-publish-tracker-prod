import { STATUSES, isStale, daysSince } from "@/lib/constants";
import { StatusGlyph } from "@/components/StatusGlyph";
import type { AppStatus } from "@/lib/types";

export function StatusDot({ status }: { status: AppStatus }) {
  return (
    <span
      className={`inline-block size-2 shrink-0 rounded-full ${STATUSES[status].dot}`}
      aria-hidden
    />
  );
}

export function StatusChip({
  status,
  since,
}: {
  status: AppStatus;
  since?: string;
}) {
  const meta = STATUSES[status];
  const stale = since ? isStale(status, since) : false;

  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px]
                    font-medium ring-1 ring-inset ${meta.chip}`}
      >
        <StatusGlyph status={status} size={11} />
        {meta.label}
      </span>
      {stale && since && (
        <span
          className="text-[12px] font-medium text-muted-foreground/80"
          title={`No status change in ${daysSince(since)} days`}
        >
          {daysSince(since)}d
        </span>
      )}
    </span>
  );
}
