import Link from "next/link";
import { EFFORT_WEIGHT, STATUSES, isStale } from "@/lib/constants";
import type { AppRow } from "@/lib/types";

/**
 * Workload pressure: how much of the work is not finished yet. An app counts
 * as done once it is in Production; everything else is still on someone's
 * plate. The same ratio is applied to the team as a whole and to each person,
 * so the numbers are directly comparable.
 *
 * A ratio against a limit, so the value is always written out rather than
 * being estimated off the arc.
 */

const ZONES = [
  { upTo: 33, label: "Comfortable", hex: "var(--st-production)" },
  { upTo: 66, label: "Busy", hex: "var(--st-in-review)" },
  { upTo: 100, label: "Under pressure", hex: "var(--st-rejected)" },
];

function zoneFor(pct: number) {
  return ZONES.find((z) => pct <= z.upTo) ?? ZONES[ZONES.length - 1];
}

/** Point on the gauge arc for t in 0..1, sweeping left to right. */
function point(t: number, radius: number) {
  const angle = Math.PI * (1 - t);
  return [100 + radius * Math.cos(angle), 100 - radius * Math.sin(angle)];
}

function arc(from: number, to: number, radius: number) {
  const [x0, y0] = point(from, radius);
  const [x1, y1] = point(to, radius);
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${radius} ${radius} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

export type WorkloadPerson = {
  name: string;
  /** Open apps on their plate. */
  open: number;
  /** Those apps weighted by the effort each state demands. */
  load: number;
  /** Of the open ones, how many are rejected, on hold or gone quiet. */
  attention: number;
  /** Their share of the team's total weighted open work. */
  pct: number;
};

export function WorkloadCard({
  total,
  open,
  people,
}: {
  total: number;
  open: number;
  people: WorkloadPerson[];
}) {
  const pct = total === 0 ? 0 : Math.round((open / total) * 100);
  const zone = zoneFor(pct);
  const t = pct / 100;
  const fairShare = people.length > 0 ? 100 / people.length : 0;

  return (
    <section className="card overflow-hidden">
      <div className="flex items-baseline justify-between border-b border-border px-4 py-2.5">
        <div>
          <h2 className="text-[14px] font-semibold text-foreground">Workload pressure</h2>
          <p className="text-[12px] text-muted-foreground">
            Share of work not yet complete.
          </p>
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-[12px] font-semibold ring-1 ring-inset"
          style={{
            color: zone.hex,
            borderColor: zone.hex,
            backgroundColor: `color-mix(in oklch, ${zone.hex} 8%, transparent)`,
          }}
        >
          {zone.label}
        </span>
      </div>

      <div className="flex flex-col items-center px-4 pb-1 pt-4">
        <svg viewBox="0 0 200 118" className="w-full max-w-[260px]" role="img"
          aria-label={`Workload pressure ${pct} percent, ${zone.label}`}>
          {/* All three zones stay visible — the needle carries the value, so
              nothing is painted over the scale it is being read against. */}
          {ZONES.map((z, i) => {
            const from = i === 0 ? 0 : ZONES[i - 1].upTo / 100;
            const activeZone = z.label === zone.label;
            return (
              <path
                key={z.label}
                d={arc(from, z.upTo / 100, 80)}
                stroke={z.hex}
                strokeOpacity={activeZone ? 1 : 0.28}
                strokeWidth={activeZone ? 15 : 12}
                fill="none"
                strokeLinecap="butt"
              />
            );
          })}

          {/* needle */}
          <g>
            <line
              x1="100" y1="100"
              x2={point(t, 66)[0].toFixed(2)} y2={point(t, 66)[1].toFixed(2)}
              stroke="var(--foreground)" strokeWidth="3" strokeLinecap="round"
            />
            <circle cx="100" cy="100" r="5" fill="var(--foreground)" />
            <circle cx="100" cy="100" r="2" fill="#fff" />
          </g>

          <text x="14" y="114" className="fill-muted-foreground" style={{ fontSize: 9 }}>0%</text>
          <text x="176" y="114" className="fill-muted-foreground" style={{ fontSize: 9 }}>100%</text>
        </svg>

        <div className="-mt-1 text-center">
          <div className="text-[30px] font-semibold leading-none" style={{ color: zone.hex }}>
            {pct}%
          </div>
          <p className="mt-1 text-[12px] text-muted-foreground">
            <span className="font-semibold text-foreground">{open}</span> of {total} apps
            still open
          </p>
        </div>
      </div>

      {/* who is carrying it */}
      <div className="mt-3 border-t border-border/60 px-4 py-3">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground/80">
            Pressure by person
          </span>
          <span className="text-[12px] text-muted-foreground/80">share of open work</span>
        </div>

        {people.length === 0 ? (
          <p className="py-2 text-center text-[12px] text-muted-foreground/80">
            Nothing in flight.
          </p>
        ) : (
          <ul className="space-y-2">
            {people.map((p) => {
              // Carrying more than your share is what "pressure" means here,
              // so colour is relative to an even split across the team.
              const ratio = fairShare > 0 ? p.pct / fairShare : 0;
              const hex =
                ratio > 1.5
                  ? "var(--st-rejected)"
                  : ratio > 1
                    ? "var(--st-in-review)"
                    : "var(--st-production)";

              return (
                <li key={p.name} className="flex items-center gap-2.5">
                  <span className="w-[92px] shrink-0 truncate text-[12px] text-foreground/85">
                    {p.name}
                  </span>

                  <span className="relative flex h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                    <span
                      className="h-full rounded-full"
                      style={{ width: `${p.pct}%`, backgroundColor: hex }}
                    />
                    {/* where an even split would sit */}
                    <span
                      className="absolute top-0 h-full w-px bg-muted-foreground/50"
                      style={{ left: `${fairShare}%` }}
                      title={`An even split would be ${Math.round(fairShare)}%`}
                    />
                  </span>

                  <span
                    className="w-9 shrink-0 text-right text-[12px] font-semibold tabular-nums"
                    style={{ color: hex }}
                  >
                    {p.pct}%
                  </span>

                  <span
                    className="w-14 shrink-0 text-right text-[12px] tabular-nums text-muted-foreground/80"
                    title={`${p.open} open apps, weighted load ${p.load}`}
                  >
                    {p.open} open
                  </span>

                  <span className="w-5 shrink-0 text-right">
                    {p.attention > 0 && (
                      <span
                        className="rounded px-1 text-[11px] font-semibold"
                        style={{
                          color: STATUSES.rejected.hex,
                          backgroundColor: `color-mix(in oklch, ${STATUSES.rejected.hex} 10%, transparent)`,
                        }}
                        title={`${p.attention} rejected, on hold or gone quiet`}
                      >
                        {p.attention}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground/80">
          Share of the team&rsquo;s open work, weighted by effort — a fresh build or a
          rejection counts {EFFORT_WEIGHT.ongoing}&times;, anything just waiting on a store
          {" "}{EFFORT_WEIGHT.in_review}&times;. The tick marks an even split.
        </p>

        <Link
          href="/reports?tab=sheet&attention=1"
          className="mt-3 inline-block text-[12px] font-medium text-muted-foreground hover:text-foreground"
        >
          Review what needs action →
        </Link>
      </div>
    </section>
  );
}

/**
 * The team gauge is the plain share of work not finished. The per-person
 * split is their portion of the team's open work, weighted by effort.
 */
export function buildWorkload(rows: AppRow[]) {
  const isOpen = (r: AppRow) => r.status !== "production";
  const needsAction = (r: AppRow) =>
    r.status === "rejected" || r.status === "on_hold" || isStale(r.status, r.status_changed_at);

  const byPerson = new Map<string, { open: number; load: number; attention: number }>();
  let teamLoad = 0;

  for (const r of rows) {
    if (!isOpen(r)) continue;

    const weight = EFFORT_WEIGHT[r.status];
    teamLoad += weight;

    const name = r.assignee_name ?? r.release_assignee_name ?? "Unassigned";
    const e = byPerson.get(name) ?? { open: 0, load: 0, attention: 0 };
    e.open += 1;
    e.load += weight;
    if (needsAction(r)) e.attention += 1;
    byPerson.set(name, e);
  }

  const people: WorkloadPerson[] = [...byPerson.entries()]
    .map(([name, e]) => ({
      name,
      open: e.open,
      load: Math.round(e.load * 10) / 10,
      attention: e.attention,
      pct: teamLoad === 0 ? 0 : Math.round((e.load / teamLoad) * 100),
    }))
    .sort((a, b) => b.pct - a.pct || b.open - a.open || a.name.localeCompare(b.name));

  return {
    total: rows.length,
    open: rows.filter(isOpen).length,
    people,
  };
}
