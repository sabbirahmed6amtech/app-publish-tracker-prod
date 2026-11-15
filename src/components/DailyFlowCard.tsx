"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FlowDay } from "@/lib/flow";

const OPENED = "#2a78d6";
const CLOSED = "var(--st-production)";
const PAD = { top: 14, right: 12, bottom: 26, left: 28 };

/**
 * Work arriving vs work finishing, per day. Two lines rather than a net
 * number, because "opened 6, closed 1" and "opened 1, closed 1" are very
 * different days that a net figure renders identically.
 *
 * The plot is drawn at the container's real pixel size rather than a fixed
 * viewBox, so it fills whatever height the row gives it — the card beside it
 * grows with the size of the team, and this one keeps pace without
 * letterboxing or distorting the strokes.
 */
export function DailyFlowCard({ days }: { days: FlowDay[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 520, h: 220 });

  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: Math.max(240, Math.round(width)), h: Math.max(140, Math.round(height)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { maxY, x, y, openedPath, closedPath, totals } = useMemo(() => {
    const maxY = Math.max(2, ...days.map((d) => Math.max(d.opened, d.closed)));
    const innerW = size.w - PAD.left - PAD.right;
    const innerH = size.h - PAD.top - PAD.bottom;

    const x = (i: number) =>
      PAD.left + (days.length <= 1 ? innerW / 2 : (i / (days.length - 1)) * innerW);
    const y = (v: number) => PAD.top + innerH - (v / maxY) * innerH;

    const line = (key: "opened" | "closed") =>
      days.map((d, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(d[key]).toFixed(1)}`).join(" ");

    return {
      maxY,
      x,
      y,
      openedPath: line("opened"),
      closedPath: line("closed"),
      totals: {
        opened: days.reduce((n, d) => n + d.opened, 0),
        closed: days.reduce((n, d) => n + d.closed, 0),
      },
    };
  }, [days, size]);

  const ticks = Array.from({ length: 3 }, (_, i) => Math.round((maxY / 2) * i));
  const active = hover !== null ? days[hover] : null;

  const net = totals.opened - totals.closed;
  const best = days.reduce<FlowDay | null>(
    (top, d) => (d.closed > 0 && (!top || d.closed > top.closed) ? d : top),
    null,
  );
  const avgOpened = (totals.opened / Math.max(days.length, 1)).toFixed(1);
  const avgClosed = (totals.closed / Math.max(days.length, 1)).toFixed(1);

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * size.w;
    const innerW = size.w - PAD.left - PAD.right;
    const i = Math.round(((px - PAD.left) / innerW) * (days.length - 1));
    setHover(Math.max(0, Math.min(days.length - 1, i)));
  }

  const label = (iso: string) =>
    new Date(iso + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" });

  return (
    <section className="card flex h-full flex-col overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border px-4 py-2.5">
        <div>
          <h2 className="text-[14px] font-semibold text-foreground">Daily opened vs closed</h2>
          <p className="text-[12px] text-muted-foreground">
            Apps added against apps reaching Production, last {days.length} days.
          </p>
        </div>
        <div className="flex items-center gap-3 text-[12px]">
          <span className="inline-flex items-center gap-1.5 text-foreground/70">
            <span className="h-0.5 w-3.5 rounded-full" style={{ background: OPENED }} />
            Opened <span className="font-semibold text-foreground">{totals.opened}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-foreground/70">
            <span className="h-0.5 w-3.5 rounded-full" style={{ background: CLOSED }} />
            Closed <span className="font-semibold text-foreground">{totals.closed}</span>
          </span>
        </div>
      </div>

      {/* the plot takes whatever height is left over */}
      <div ref={plotRef} className="min-h-[150px] flex-1 px-2 pt-2">
        <svg
          viewBox={`0 0 ${size.w} ${size.h}`}
          width="100%"
          height="100%"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
          role="img"
          aria-label={`Daily opened versus closed over ${days.length} days`}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left} x2={size.w - PAD.right} y1={y(t)} y2={y(t)}
                stroke="var(--border)" strokeWidth="1"
              />
              <text x={PAD.left - 6} y={y(t) + 3} textAnchor="end"
                fill="var(--muted-foreground)" style={{ fontSize: 9 }}>
                {t}
              </text>
            </g>
          ))}

          <path d={openedPath} fill="none" stroke={OPENED} strokeWidth="2"
            strokeLinejoin="round" strokeLinecap="round" />
          <path d={closedPath} fill="none" stroke={CLOSED} strokeWidth="2"
            strokeLinejoin="round" strokeLinecap="round" />

          {hover !== null && (
            <>
              <line
                x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={size.h - PAD.bottom}
                stroke="color-mix(in oklch, var(--muted-foreground) 55%, transparent)" strokeWidth="1"
              />
              {(["opened", "closed"] as const).map((k) => (
                <circle
                  key={k}
                  cx={x(hover)}
                  cy={y(days[hover][k])}
                  r="4"
                  fill={k === "opened" ? OPENED : CLOSED}
                  stroke="#fff"
                  strokeWidth="2"
                />
              ))}
            </>
          )}

          {days.length > 0 && (
            <>
              <text x={PAD.left} y={size.h - 8} fill="var(--muted-foreground)" style={{ fontSize: 9 }}>
                {label(days[0].date)}
              </text>
              <text x={size.w - PAD.right} y={size.h - 8} textAnchor="end"
                fill="var(--muted-foreground)" style={{ fontSize: 9 }}>
                {label(days[days.length - 1].date)}
              </text>
            </>
          )}
        </svg>
      </div>

      <div className="h-5 shrink-0 px-4 text-center text-[12px] text-muted-foreground">
        {active ? (
          <>
            <span className="font-medium text-foreground">{label(active.date)}</span>
            <span className="mx-2 text-muted-foreground/50">·</span>
            <span style={{ color: OPENED }}>{active.opened} opened</span>
            <span className="mx-2 text-muted-foreground/50">·</span>
            <span style={{ color: CLOSED }}>{active.closed} closed</span>
          </>
        ) : (
          <span className="text-muted-foreground/80">Hover the chart for a day&rsquo;s numbers</span>
        )}
      </div>

      <div className="grid shrink-0 grid-cols-3 divide-x divide-border border-t border-border">
        <Stat
          label="Net change"
          value={`${net > 0 ? "+" : ""}${net}`}
          hint={net > 0 ? "backlog grew" : net < 0 ? "backlog shrank" : "held level"}
          tone={net > 0 ? "var(--st-rejected)" : net < 0 ? "var(--st-production)" : undefined}
        />
        <Stat
          label="Busiest close"
          value={best ? `${best.closed}` : "—"}
          hint={best ? label(best.date) : "nothing shipped"}
        />
        <Stat label="Per day" value={`${avgOpened} / ${avgClosed}`} hint="opened / closed" />
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: string;
}) {
  return (
    <div className="px-4 py-3">
      <div className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-[20px] font-semibold leading-none" style={{ color: tone ?? "var(--foreground)" }}>
        {value}
      </div>
      <div className="mt-1 truncate text-[12px] text-muted-foreground/80">{hint}</div>
    </div>
  );
}
