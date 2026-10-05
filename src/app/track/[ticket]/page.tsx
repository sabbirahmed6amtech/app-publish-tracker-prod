import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeftIcon, ExternalLinkIcon } from "lucide-react";
import { TrackerSearch } from "@/components/tracker/TrackerSearch";
import { StageTrack } from "@/components/tracker/StageTrack";
import { StatusGlyph } from "@/components/StatusGlyph";
import { CopyReportButton } from "@/components/CopyReportButton";
import { buildReport } from "@/lib/report";
import { StoreIcon } from "@/components/StoreIcon";
import { ProjectLogo } from "@/components/ProjectLogo";
import {
  trackerClient,
  type TrackerApp,
  type TrackerClient,
  type TrackerRelease,
} from "@/lib/queries";
import {
  PIPELINE_ORDER,
  PLATFORMS,
  STATUSES,
  displayName,
  formatDate,
} from "@/lib/constants";
import type { Platform } from "@/lib/types";

export const dynamic = "force-dynamic";

const PLATFORM_ORDER: Platform[] = ["play_store", "app_store"];

export default async function TrackClientPage({
  params,
}: {
  params: Promise<{ ticket: string }>;
}) {
  const { ticket } = await params;
  const client = await trackerClient(decodeURIComponent(ticket));
  if (!client) notFound();

  const [current, ...older] = client.releases;
  // An empty earlier release says nothing to someone checking status.
  const past = older.filter((r) => r.apps.length > 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/track"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" /> All clients
        </Link>
        <div className="w-full sm:w-72">
          <Suspense>
            <TrackerSearch size="sm" />
          </Suspense>
        </div>
      </div>

      {current ? (
        <Overview name={client.name} ticket={client.ticket} release={current} />
      ) : (
        <section className="rounded-2xl border bg-card p-6 shadow-xs">
          <h1 className="text-[22px] font-semibold tracking-tight">{client.name}</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Ticket #{client.ticket} · Nothing has been submitted yet.
          </p>
        </section>
      )}

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          {current &&
            PLATFORM_ORDER.map((platform) => {
              const apps = current.apps.filter((a) => a.platform === platform);
              return apps.length ? (
                <StoreCard
                  key={platform}
                  platform={platform}
                  apps={apps}
                  owner={current.assignee}
                  delay={platform === "play_store" ? 0.1 : 0.2}
                />
              ) : null;
            })}

          {past.length > 0 && <PastReleases releases={past} />}
        </div>

        <Activity items={client.activity.slice(0, 8)} />
      </div>
    </div>
  );
}

// ----------------------------------------------------------- overview --

function Overview({
  name,
  ticket,
  release,
}: {
  name: string;
  ticket: string;
  release: TrackerRelease;
}) {
  const total = release.apps.length;
  const live = release.apps.filter((a) => a.status === "production").length;
  const blocked = release.apps.filter((a) => STATUSES[a.status].group === "attention").length;
  const pct = total ? Math.round((live / total) * 100) : 0;
  const lastChange = release.apps.reduce<string | null>(
    (latest, a) => (!latest || a.status_changed_at > latest ? a.status_changed_at : latest),
    null,
  );

  const state =
    total === 0
      ? { label: "Getting started", tone: "bg-muted text-muted-foreground" }
      : live === total
        ? { label: "All live", tone: "bg-good-soft text-good" }
        : blocked
          ? { label: "Needs attention", tone: "bg-bad-soft text-bad" }
          : { label: "In progress", tone: "bg-info-soft text-info" };

  // The same plain-text report the team pastes, from public fields only.
  const report = buildReport(
    [
      {
        ticket,
        clientName: name,
        label: release.label,
        note: null,
        apps: release.apps.map((a, i) => ({
          platform: a.platform,
          projectName: a.project,
          status: a.status,
          storeUrl: a.store_url,
          note: null,
          sortOrder: i,
        })),
      },
    ],
    [...new Set(release.apps.flatMap((a) => (a.line ? [a.line] : [])))],
  );

  // How many apps sit at each status, in pipeline order.
  const counts = PIPELINE_ORDER.map((s) => ({ status: s, n: release.apps.filter((a) => a.status === s).length }))
    .filter((c) => c.n > 0);

  return (
    <section className="tracker-rise rounded-2xl border bg-card p-5 shadow-xs sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[24px] font-semibold tracking-tight">{name}</h1>
            <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${state.tone}`}>
              {state.label}
            </span>
          </div>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Ticket <span className="font-mono">#{ticket}</span> ·{" "}
            <span className="font-medium text-foreground">{release.label}</span> ·{" "}
            {release.released_on
              ? `Live since ${formatDate(release.released_on)}`
              : `Started ${formatDate(release.started_on)}`}
          </p>
          {release.assignee && (
            <div className="mt-3 inline-flex items-center gap-2 rounded-full border bg-muted/40 py-1 pl-1 pr-3">
              <Avatar name={release.assignee} />
              <span className="text-[12px] leading-tight">
                <span className="text-muted-foreground">Developer: </span>
                <span className="font-medium">{displayName(release.assignee)}</span>
              </span>
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <CopyReportButton report={report} className="btn btn-secondary h-8 text-[12px]" />
          {lastChange && (
            <p className="text-[12px] text-muted-foreground">Updated {ago(lastChange)}</p>
          )}
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-1.5 flex items-baseline justify-between text-[13px]">
          <span className="font-medium">
            {live} of {total} {total === 1 ? "app" : "apps"} live
          </span>
          <span className="tabular-nums text-muted-foreground">{pct}%</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-muted">
          <div
            className="tracker-fill h-full rounded-full bg-[var(--st-production)]"
            style={{ width: `${pct}%` }}
          />
        </div>
        {counts.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {counts.map((c) => (
              <li
                key={c.status}
                className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-medium ring-1 ring-inset ${STATUSES[c.status].chip}`}
              >
                <StatusGlyph status={c.status} size={11} />
                {c.n} {STATUSES[c.status].label}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

// --------------------------------------------------------- store card --

function StoreCard({
  platform,
  apps,
  owner,
  delay,
}: {
  platform: Platform;
  apps: TrackerApp[];
  /** The release owner; an app handled by someone else names them. */
  owner: string | null;
  delay: number;
}) {
  const live = apps.filter((a) => a.status === "production").length;

  return (
    <section
      className="tracker-rise overflow-hidden rounded-2xl border bg-card shadow-xs"
      style={{ animationDelay: `${delay}s` }}
    >
      <header className="flex items-center gap-2.5 border-b px-5 py-3">
        <StoreIcon platform={platform} size={18} />
        <h2 className="text-[15px] font-semibold">{PLATFORMS[platform].label}</h2>
        <span className="ml-auto text-[12px] tabular-nums text-muted-foreground">
          {live}/{apps.length} live
        </span>
      </header>
      <ul className="divide-y">
        {/* The tracker exposes no ids, and an app can appear twice in a release. */}
        {apps.map((a, i) => (
          <li
            key={`${a.project}-${i}`}
            className="tracker-rise flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4 transition-colors hover:bg-muted/30"
            style={{ animationDelay: `${delay + 0.08 * (i + 1)}s` }}
          >
            <div className="flex min-w-0 flex-1 basis-56 items-center gap-3">
              <ProjectLogo
                badge={a.line ? { line: a.line, logo: a.logo } : null}
                project={a.project}
                size="md"
              />
              <div className="min-w-0 leading-tight">
                <div className="truncate text-[14px] font-semibold">
                  {a.app_name || a.project}
                </div>
                <div className="mt-0.5 truncate text-[12px] text-muted-foreground">
                  {a.project}
                  {a.build && (
                    <>
                      {" · "}
                      <span className="font-mono">{a.build}</span>
                    </>
                  )}
                </div>
                {a.assignee && a.assignee !== owner && (
                  <div className="mt-1 inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Avatar name={a.assignee} size="xs" />
                    {displayName(a.assignee)}
                  </div>
                )}
              </div>
            </div>

            <StageTrack status={a.status} platform={platform} />

            <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:min-w-44 sm:justify-end">
              <div className="text-right leading-tight">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-medium ring-1 ring-inset ${STATUSES[a.status].chip}`}
                >
                  <StatusGlyph status={a.status} size={11} />
                  {STATUSES[a.status].label}
                </span>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {a.status === "production" ? "since " : "for "}
                  {duration(a.status_changed_at)}
                </div>
              </div>
              {a.store_url && (
                <a
                  href={a.store_url}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-secondary h-8 shrink-0 px-2.5 text-[12px]"
                >
                  View <ExternalLinkIcon className="size-3.5" />
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ------------------------------------------------------ past releases --

function PastReleases({ releases }: { releases: TrackerRelease[] }) {
  return (
    <section
      className="tracker-rise overflow-hidden rounded-2xl border bg-card shadow-xs"
      style={{ animationDelay: "0.35s" }}
    >
      <header className="border-b px-5 py-3">
        <h2 className="text-[15px] font-semibold">Earlier releases</h2>
      </header>
      <ul className="divide-y">
        {releases.map((r) => {
          const live = r.apps.filter((a) => a.status === "production").length;
          return (
            <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
              <span className="text-[14px] font-semibold">{r.label}</span>
              <span className="flex items-center gap-1" aria-hidden>
                {r.apps.map((a, i) => (
                  <StatusGlyph key={i} status={a.status} size={10} />
                ))}
              </span>
              <span className="ml-auto text-[12px] text-muted-foreground">
                {live}/{r.apps.length} live ·{" "}
                {r.released_on
                  ? `released ${formatDate(r.released_on)}`
                  : `started ${formatDate(r.started_on)}`}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ----------------------------------------------------------- activity --

function Activity({ items }: { items: TrackerClient["activity"] }) {
  return (
    <section
      className="tracker-rise rounded-2xl border bg-card shadow-xs lg:sticky lg:top-6"
      style={{ animationDelay: "0.15s" }}
    >
      <header className="border-b px-5 py-3">
        <h2 className="text-[15px] font-semibold">Recent updates</h2>
      </header>
      {items.length === 0 ? (
        <p className="px-5 py-8 text-center text-[13px] text-muted-foreground">No updates yet.</p>
      ) : (
        <ol className="relative space-y-4 px-5 py-4">
          {items.map((e, i) => (
            <li
              key={i}
              className="tracker-rise flex gap-3"
              style={{ animationDelay: `${0.25 + i * 0.06}s` }}
            >
              <span className="mt-0.5">
                {e.to ? <StatusGlyph status={e.to} size={14} /> : null}
              </span>
              <div className="min-w-0 leading-snug">
                <p className="text-[13px]">
                  <span className="font-medium">{e.app}</span>{" "}
                  <span className="inline-flex translate-y-0.5">
                    <StoreIcon platform={e.platform} size={12} />
                  </span>
                </p>
                <p className="text-[12px] text-muted-foreground">
                  {e.from && e.to
                    ? `${STATUSES[e.from].label} → ${STATUSES[e.to].label}`
                    : e.to
                      ? STATUSES[e.to].label
                      : "Updated"}
                  {e.version ? ` · v${e.version}` : ""}
                </p>
                <p className="text-[11px] text-muted-foreground">{ago(e.at)}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

// ------------------------------------------------------------ helpers --

function Avatar({ name, size = "sm" }: { name: string; size?: "xs" | "sm" }) {
  const letters = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-full bg-primary font-semibold text-primary-foreground ${
        size === "xs" ? "size-4 text-[8px]" : "size-6 text-[10px]"
      }`}
    >
      {letters || "?"}
    </span>
  );
}


/** "3 days", "5 hours", "just now" — how long something has been the case. */
function duration(iso: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 60) return minutes <= 1 ? "a minute" : `${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? "an hour" : `${hours} hours`;
  const days = Math.floor(hours / 24);
  if (days < 60) return days === 1 ? "a day" : `${days} days`;
  const months = Math.floor(days / 30);
  return `${months} months`;
}

function ago(iso: string): string {
  const d = duration(iso);
  return d === "a minute" ? "just now" : `${d} ago`;
}
