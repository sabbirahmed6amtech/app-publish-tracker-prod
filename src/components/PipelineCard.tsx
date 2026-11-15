import Link from "next/link";
import { Fragment } from "react";
import { StatusGlyph } from "@/components/StatusGlyph";
import { PLATFORMS, STATUSES } from "@/lib/constants";
import type { AppStatus, Platform } from "@/lib/types";

export type PipelineStage = {
  status: AppStatus;
  count: number;
  /** Days since the longest-waiting app in this stage last moved. */
  oldestDays: number | null;
};

/** The path an app actually travels, left to right. */
const FLOW: AppStatus[] = ["ongoing", "in_review", "closed_testing", "production"];
/** States an app falls out of the flow into. */
const OFF_RAMPS: AppStatus[] = ["on_hold", "rejected"];

export function PipelineCard({
  stages,
  total,
  platforms,
}: {
  stages: PipelineStage[];
  total: number;
  platforms: { platform: Platform; count: number }[];
}) {
  const byStatus = new Map(stages.map((s) => [s.status, s]));
  const stage = (status: AppStatus): PipelineStage =>
    byStatus.get(status) ?? { status, count: 0, oldestDays: null };

  const live = stage("production").count;
  const blocked = OFF_RAMPS.reduce((n, s) => n + stage(s).count, 0);

  if (total === 0) {
    return (
      <section className="card mb-4 px-4 py-10 text-center">
        <h2 className="text-[14px] font-semibold text-foreground">Pipeline</h2>
        <p className="mt-1 text-[14px] text-muted-foreground/80">
          No apps yet — the pipeline fills in as releases get their apps.
        </p>
      </section>
    );
  }

  return (
    <section className="card mb-4 px-4 py-4">
      <div className="mb-3.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-[14px] font-semibold text-foreground">Pipeline</h2>
        <p className="text-[12px] text-muted-foreground">
          <span className="font-semibold text-foreground">{live}</span> of {total} live
          <span className="mx-2 text-muted-foreground/50">·</span>
          {platforms.map((p, i) => (
            <span key={p.platform}>
              {i > 0 && <span className="mx-2 text-muted-foreground/50">·</span>}
              {PLATFORMS[p.platform].label}{" "}
              <span className="font-semibold text-foreground">{p.count}</span>
            </span>
          ))}
        </p>
      </div>

      {/* the flow */}
      <div className="grid grid-cols-2 gap-2 lg:flex lg:items-stretch lg:gap-0">
        {FLOW.map((status, i) => (
          <Fragment key={status}>
            {i > 0 && (
              <div
                className="hidden shrink-0 items-center px-1.5 lg:flex"
                aria-hidden
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path
                    d="m9 5 7 7-7 7"
                    stroke="var(--border)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            )}
            <StageCard stage={stage(status)} total={total} />
          </Fragment>
        ))}
      </div>

      {/* what has fallen out of the flow */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
        <span className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground/80">
          Off the flow
        </span>
        {OFF_RAMPS.map((status) => {
          const s = stage(status);
          const meta = STATUSES[status];
          return (
            <Link
              key={status}
              href={`/reports?tab=sheet&status=${status}`}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1
                          text-[12px] font-medium ring-1 ring-inset transition-opacity
                          hover:opacity-80 ${meta.chip} ${s.count === 0 ? "opacity-40" : ""}`}
            >
              <StatusGlyph status={status} size={11} />
              {meta.label}
              <span className="font-semibold tabular-nums">{s.count}</span>
              {s.count > 0 && s.oldestDays !== null && (
                <span className="font-normal opacity-70">· {s.oldestDays}d</span>
              )}
            </Link>
          );
        })}
        {blocked === 0 && (
          <span className="text-[12px] text-muted-foreground/80">Nothing blocked.</span>
        )}
      </div>
    </section>
  );
}

function StageCard({ stage, total }: { stage: PipelineStage; total: number }) {
  const meta = STATUSES[stage.status];
  const share = total > 0 ? (stage.count / total) * 100 : 0;
  const empty = stage.count === 0;

  return (
    <Link
      href={`/reports?tab=sheet&status=${stage.status}`}
      className={`group relative min-w-0 flex-1 overflow-hidden rounded-lg border
                  border-border bg-card px-3 pb-2.5 pt-2.5 transition-all
                  hover:border-ring/60 hover:shadow-[0_1px_3px_rgba(16,24,40,0.08)]
                  ${empty ? "opacity-55" : ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <StatusGlyph status={stage.status} size={12} />
          <span className="truncate text-[12px] font-medium text-foreground/70">
            {meta.label}
          </span>
        </span>
        {!empty && stage.oldestDays !== null && stage.status !== "production" && (
          <span
            className="shrink-0 text-[12px] tabular-nums text-muted-foreground/80"
            title={`Longest-waiting app has been here ${stage.oldestDays} days`}
          >
            {stage.oldestDays}d
          </span>
        )}
      </div>

      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-[24px] font-semibold leading-none text-foreground">
          {stage.count}
        </span>
        {!empty && (
          <span className="text-[12px] text-muted-foreground/80">{Math.round(share)}%</span>
        )}
      </div>

      {/* share of the whole pipeline, in the stage's own colour */}
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${share}%`, backgroundColor: meta.hex }}
        />
      </div>
    </Link>
  );
}
