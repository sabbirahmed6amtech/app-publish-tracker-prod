import Link from "next/link";
import { ArrowRightIcon, ChevronLeftIcon, ChevronRightIcon, PlusIcon } from "lucide-react";
import { ProjectLogo } from "@/components/ProjectLogo";
import { StoreIcon } from "@/components/StoreIcon";
import { StatusGlyph } from "@/components/StatusGlyph";
import { STATUSES, displayName } from "@/lib/constants";
import type { AppEvent, AppStatus, LineBadge, Platform } from "@/lib/types";

export type TimelineApp = { name: string; project: string; platform: Platform };

/**
 * A release's history as a timeline grouped by day, one page at a time. The
 * page number lives in the URL, so paging survives a refresh and a shared link.
 */
export function ActivityTimeline({
  events,
  apps,
  badges,
  page,
  pageSize,
  total,
  hrefFor,
}: {
  events: AppEvent[];
  apps: Map<string, TimelineApp>;
  badges: Record<string, LineBadge>;
  page: number;
  pageSize: number;
  total: number;
  /** Link to another page of the timeline. */
  hrefFor: (page: number) => string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);

  return (
    <section id="activity" className="card mt-4 scroll-mt-20 overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <h2 className="text-[14px] font-semibold">Activity</h2>
          <p className="text-[12px] text-muted-foreground">
            Every status change in this release, newest first.
          </p>
        </div>
        {total > 0 && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[12px] font-medium tabular-nums text-muted-foreground">
            {total} {total === 1 ? "update" : "updates"}
          </span>
        )}
      </header>

      {events.length === 0 ? (
        <p className="px-4 py-10 text-center text-[14px] text-muted-foreground">
          Nothing has happened in this release yet.
        </p>
      ) : (
        <div className="px-4 py-3">
          {byDay(events).map(([day, dayEvents]) => (
            <div key={day} className="mb-2 last:mb-0">
              <h3 className="sticky top-14 z-10 -mx-4 bg-card/95 px-4 py-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
                {day}
              </h3>
              <ol className="relative ml-[15px] border-l pl-6">
                {dayEvents.map((e) => {
                  const app = apps.get(e.app_id);
                  return (
                    <li key={e.id} className="relative py-2.5">
                      {/* The dot on the line takes the colour and shape of where it ended up. */}
                      <span className="absolute -left-[33px] top-3 grid size-[17px] place-items-center rounded-full bg-card ring-4 ring-card">
                        {e.to_status ? (
                          <StatusGlyph status={e.to_status} size={15} />
                        ) : (
                          <span className="size-2 rounded-full bg-muted-foreground/50" />
                        )}
                      </span>

                      <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
                        <div className="flex min-w-0 flex-1 items-center gap-2.5">
                          {app && (
                            <ProjectLogo badge={badges[app.project]} project={app.project} />
                          )}
                          <div className="min-w-0 leading-tight">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate text-[14px] font-semibold">
                                {app?.name ?? "Removed app"}
                              </span>
                              {app && <StoreIcon platform={app.platform} size={12} />}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground">
                              <Change event={e} />
                            </div>
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-2 text-[12px] text-muted-foreground">
                          {e.actor && (
                            <span className="inline-flex items-center gap-1.5">
                              <span className="grid size-5 place-items-center rounded-full bg-primary text-[11px] font-semibold uppercase text-primary-foreground">
                                {initials(e.actor)}
                              </span>
                              <span className="hidden sm:inline">{displayName(e.actor)}</span>
                            </span>
                          )}
                          <time
                            dateTime={e.created_at}
                            title={new Date(e.created_at).toLocaleString()}
                            className="tabular-nums"
                          >
                            {relative(e.created_at)}
                          </time>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </div>
      )}

      {pages > 1 && (
        <footer className="flex items-center justify-between gap-3 border-t px-4 py-2.5">
          <span className="text-[12px] tabular-nums text-muted-foreground">
            Showing {first}–{last} of {total}
          </span>
          <nav className="flex items-center gap-1" aria-label="Activity pages">
            <PageLink href={page > 1 ? hrefFor(page - 1) : null} label="Newer">
              <ChevronLeftIcon className="size-4" /> Newer
            </PageLink>
            <span className="px-2 text-[12px] tabular-nums text-muted-foreground">
              {page} / {pages}
            </span>
            <PageLink href={page < pages ? hrefFor(page + 1) : null} label="Older">
              Older <ChevronRightIcon className="size-4" />
            </PageLink>
          </nav>
        </footer>
      )}
    </section>
  );
}

function Change({ event: e }: { event: AppEvent }) {
  if (e.kind === "status" && e.from_status && e.to_status) {
    return (
      <>
        <Pill status={e.from_status} faded />
        <ArrowRightIcon className="size-3.5" />
        <Pill status={e.to_status} />
      </>
    );
  }
  if (e.kind === "created") {
    return (
      <>
        <PlusIcon className="size-3.5" />
        <span>Added to the release</span>
        {e.to_status && <Pill status={e.to_status} />}
      </>
    );
  }
  return <span>{e.message || e.kind}</span>;
}

function Pill({ status, faded = false }: { status: AppStatus; faded?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[12px] font-medium ring-1 ring-inset ${
        STATUSES[status].chip
      } ${faded ? "opacity-60" : ""}`}
    >
      <StatusGlyph status={status} size={10} />
      {STATUSES[status].label}
    </span>
  );
}

function PageLink({
  href,
  label,
  children,
}: {
  href: string | null;
  label: string;
  children: React.ReactNode;
}) {
  const className = "btn btn-secondary h-7 gap-1 px-2 text-[12px]";
  if (!href) {
    return (
      <span aria-disabled className={`${className} pointer-events-none opacity-40`}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} scroll={false} aria-label={`${label} activity`} className={className}>
      {children}
    </Link>
  );
}

/** Group events under "Today", "Yesterday" or a date, keeping their order. */
function byDay(events: AppEvent[]): [string, AppEvent[]][] {
  const groups = new Map<string, AppEvent[]>();
  for (const e of events) {
    const label = dayLabel(e.created_at);
    groups.set(label, [...(groups.get(label) ?? []), e]);
  }
  return [...groups.entries()];
}

function dayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((startOf(today) - startOf(date)) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(date.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}),
  });
}

function relative(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2);
  return words[0][0] + words[1][0];
}
