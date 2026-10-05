import Link from "next/link";
import { StatusChip } from "@/components/StatusChip";
import { PipelineCard } from "@/components/PipelineCard";
import { WorkloadCard, buildWorkload } from "@/components/WorkloadCard";
import { DailyFlowCard } from "@/components/DailyFlowCard";
import { buildDailyFlow } from "@/lib/flow";
import {
  buildStats,
  flatten,
  getClients,
  getRecentActivity,
  getTeam,
  teamIndex,
} from "@/lib/queries";
import {
  PLATFORMS,
  RELEASE_STATES,
  STATUSES,
  releaseLabel,
  STATUS_ORDER,
  daysSince,
  formatDate,
  releaseState,
} from "@/lib/constants";
import type { AppRow } from "@/lib/types";

/** The lead's view: pipeline, workload, flow and what is stuck. */
export async function ReportsOverview() {
  // Independent queries, so pay one round trip instead of three.
  const [clients, roster, activity] = await Promise.all([
    getClients(),
    getTeam(),
    getRecentActivity(10).catch(() => []),
  ]);
  const names = teamIndex(roster);
  const rows = flatten(clients, names);
  const stats = buildStats(clients, rows);
  const workload = buildWorkload(rows);
  const flow = buildDailyFlow(rows, 30);

  // Each stage's count plus how long its longest-waiting app has sat there.
  const stages = STATUS_ORDER.map((status) => {
    const inStage = rows.filter((r) => r.status === status);
    return {
      status,
      count: inStage.length,
      oldestDays: inStage.length
        ? Math.max(...inStage.map((r) => daysSince(r.status_changed_at)))
        : null,
    };
  });

  // Every open release across every client, oldest start first.
  const openReleases = clients
    .flatMap((c) => c.releases.map((r) => ({ release: r, client: c })))
    .filter(({ release }) => !release.released_on)
    .sort((a, b) => a.release.started_on.localeCompare(b.release.started_on));

  return (
    <>
      <div className="card mb-4 grid grid-cols-2 divide-border sm:grid-cols-4 sm:divide-x">
        <Stat label="Clients" value={stats.totalClients} />
        <Stat label="Open releases" value={stats.openReleases} />
        <Stat
          label="Waiting on stores"
          value={stats.waiting.length}
          tone={stats.waiting.length ? "text-warn" : undefined}
        />
        <Stat
          label="Needs attention"
          value={stats.needsAttention.length}
          tone={stats.needsAttention.length ? "text-bad" : undefined}
        />
      </div>

      <PipelineCard
        stages={stages}
        total={stats.totalApps}
        platforms={stats.byPlatform}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <WorkloadCard
          total={workload.total}
          open={workload.open}
          people={workload.people}
        />

        <DailyFlowCard days={flow} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <QueueCard
          title="Needs attention"
          hint="Rejected or on hold — someone has to act."
          rows={stats.needsAttention}
          empty="Nothing rejected or blocked."
        />

        <QueueCard
          title="Waiting on the stores"
          hint="Submitted and sitting in review, oldest first."
          rows={stats.waiting}
          empty="Nothing is in review right now."
        />
      </div>

      <div className="mt-4 grid items-start gap-4 xl:grid-cols-2">
        <section className="card overflow-hidden">
          <div className="flex items-baseline justify-between border-b border-border px-4 py-2.5">
            <div>
              <h2 className="text-[13px] font-semibold text-foreground">Open releases</h2>
              <p className="text-[11px] text-muted-foreground">Still in flight, oldest first.</p>
            </div>
            <span className="text-[13px] font-semibold text-foreground">
              {openReleases.length}
            </span>
          </div>

          {openReleases.length === 0 ? (
            <p className="px-4 py-10 text-center text-[13px] text-muted-foreground/80">
              Nothing open. Every release is fully live.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {openReleases.slice(0, 8).map(({ release, client }) => {
                const state = releaseState(release.apps);
                const live = release.apps.filter((a) => a.status === "production").length;

                return (
                  <li key={release.id}>
                    <Link
                      href={`/releases/${release.id}`}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50"
                    >
                      <span className={`size-2 shrink-0 rounded-full ${RELEASE_STATES[state].dot}`} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium text-foreground">
                          {client.name} · {releaseLabel(release)}
                        </div>
                        <div className="truncate text-[11px] text-muted-foreground">
                          {(release.assigned_to && names.get(release.assigned_to)) || "Unassigned"} ·{" "}
                          {release.apps.length} apps ·{" "}
                          {live} live
                        </div>
                      </div>
                      <span className="shrink-0 text-right text-[11px] text-muted-foreground/80">
                        {formatDate(release.started_on)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>


        {activity.length > 0 && (
          <section className="card overflow-hidden">
            <div className="border-b border-border px-4 py-2.5">
              <h2 className="text-[13px] font-semibold text-foreground">Recent activity</h2>
            </div>
            <ul className="divide-y divide-border/60">
              {activity.map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-4 py-2 text-[13px]">
                  <span className="w-20 shrink-0 text-[11px] text-muted-foreground/80">
                    {relative(e.created_at)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-foreground/85">
                    <strong className="font-medium text-foreground">
                      {e.apps?.app_name || e.apps?.project_name || "App"}
                    </strong>{" "}
                    {e.kind === "status" && e.from_status && e.to_status ? (
                      <>
                        {STATUSES[e.from_status].label} → {STATUSES[e.to_status].label}
                      </>
                    ) : (
                      e.message || e.kind
                    )}
                  </span>
                  {e.to_status && <StatusChip status={e.to_status} />}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="px-4 py-3.5">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={`mt-0.5 text-[22px] font-semibold ${tone ?? "text-foreground"}`}>
        {value}
      </div>
    </div>
  );
}

function QueueCard({
  title,
  hint,
  rows,
  empty,
}: {
  title: string;
  hint: string;
  rows: AppRow[];
  empty: string;
}) {
  return (
    <section className="card overflow-hidden">
      <div className="flex items-baseline justify-between border-b border-border px-4 py-2.5">
        <div>
          <h2 className="text-[13px] font-semibold text-foreground">{title}</h2>
          <p className="text-[11px] text-muted-foreground">{hint}</p>
        </div>
        <span className="text-[13px] font-semibold text-foreground">{rows.length}</span>
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-10 text-center text-[13px] text-muted-foreground/80">{empty}</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {rows.slice(0, 8).map((r) => (
            <li key={r.id}>
              <Link
                href={`/releases/${r.release_id}`}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-foreground">
                    {r.app_name || r.project_name}
                  </div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {r.client_name} · {r.release_label} · {PLATFORMS[r.platform].label}
                    {r.assignee_name ? ` · ${r.assignee_name}` : ""}
                    {r.note ? ` · ${r.note}` : ""}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <StatusChip status={r.status} />
                  <div className="mt-0.5 text-[11px] text-muted-foreground/80">
                    {daysSince(r.status_changed_at)}d
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function relative(iso: string): string {
  const d = daysSince(iso);
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
