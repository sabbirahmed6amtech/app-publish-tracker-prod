"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { ChevronRightIcon, ExternalLinkIcon, MoreHorizontalIcon, SearchIcon } from "lucide-react";
import { toast } from "sonner";
import { AppPreviewSheet } from "@/components/AppPreviewRow";
import type { AppImages } from "@/lib/appImages";
import { expectedVersion, liveButNotMoved, timeAgo, type StoreInfo } from "@/lib/storeWatch";
import { DrawerPublishButton } from "@/components/PublishPanel";
import { StatusMenuItems } from "@/components/RowActions";
import { StatusGlyph } from "@/components/StatusGlyph";
import { ProjectLogo } from "@/components/ProjectLogo";
import { StoreIcon } from "@/components/StoreIcon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PIPELINE_ORDER, PLATFORMS, STATUSES, daysSince, isStale } from "@/lib/constants";
import { setAppStatus } from "@/lib/actions";
import type {
  AppRow,
  AppStatus,
  Client,
  Keystore,
  LineBadge,
  Product,
  TeamMember,
} from "@/lib/types";

/** Live apps pile up forever; by default the column shows only recent ones. */
const RECENT_LIVE_DAYS = 14;
const FILTERS_KEY = "board-filters";

type Focus = "all" | "attention" | "stuck" | "unassigned";
type Filters = { q: string; client: string; assignee: string; platform: string; focus: Focus };
const NO_FILTERS: Filters = {
  q: "",
  client: "all",
  assignee: "all",
  platform: "all",
  focus: "all",
};

const FOCUS: { key: Exclude<Focus, "all">; label: string; hint: string }[] = [
  { key: "attention", label: "Rejected or on hold", hint: "Someone has to act" },
  { key: "stuck", label: "Stuck 7+ days", hint: "No status change in a week" },
  { key: "unassigned", label: "Unassigned", hint: "Nobody owns these yet" },
];

function inFocus(r: AppRow, focus: Focus, status: AppStatus): boolean {
  if (focus === "attention") return STATUSES[status].group === "attention";
  if (focus === "stuck") return isStale(status, r.status_changed_at);
  if (focus === "unassigned") return !r.assigned_to;
  return true;
}

export function StatusBoard({
  rows,
  team,
  clients,
  keystores,
  meId,
  badges,
  images = {},
  publishing = {},
  stores = {},
}: {
  rows: AppRow[];
  team: TeamMember[];
  clients: { id: string; name: string }[];
  keystores: Keystore[];
  meId: string | null;
  /** project name -> product line logo */
  badges: Record<string, LineBadge>;
  /** product id -> the client's image links */
  images?: Record<string, AppImages>;
  /** product id -> what the drawer's Publish needs: the client and the app */
  publishing?: Record<string, { client: Client; product: Product; update: boolean }>;
  /** product id -> what Store Watch last saw on the store */
  stores?: Record<string, StoreInfo>;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  // The board always opens on your own work; Clear comes back here too.
  const defaults: Filters = meId ? { ...NO_FILTERS, assignee: "me" } : NO_FILTERS;
  const [filters, setFilters] = useState<Filters>(defaults);
  const [showAllLive, setShowAllLive] = useState(false);
  // Moves show immediately; the server catches up behind them.
  const [moved, setMoved] = useState<Record<string, AppStatus>>({});
  const [dragId, setDragId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<AppStatus | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  // Open client groups, by "status:clientId". Groups start closed.
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Fresh server data supersedes optimistic moves.
  useEffect(() => setMoved({}), [rows]);

  // Remember filters per browser — a convenience, so failures are ignored.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(FILTERS_KEY);
      // Client and store are remembered; the person always starts as you.
      if (saved) {
        const { client, platform } = { ...NO_FILTERS, ...JSON.parse(saved) };
        setFilters((f) => ({ ...f, client, platform }));
      }
    } catch {}
  }, []);
  function update(patch: Partial<Filters>) {
    setFilters((f) => {
      const next = { ...f, ...patch };
      try {
        localStorage.setItem(FILTERS_KEY, JSON.stringify({ ...next, q: "" }));
      } catch {}
      return next;
    });
  }

  const keystoreById = useMemo(() => new Map(keystores.map((k) => [k.id, k])), [keystores]);
  const statusOf = (r: AppRow) => moved[r.id] ?? r.status;
  // The store already shows this release, but it isn't in Production yet.
  const liveNow = (r: AppRow) =>
    liveButNotMoved(stores[r.product_id] ?? null, statusOf(r), r.build_version, r.release_version);

  // Everything the person/client/store filters allow, before focus and search.
  const scoped = useMemo(
    () =>
      rows.filter((r) => {
        if (filters.client !== "all" && r.client_id !== filters.client) return false;
        if (filters.platform !== "all" && r.platform !== filters.platform) return false;
        if (filters.assignee === "me" && r.assigned_to !== meId) return false;
        if (filters.assignee === "none" && r.assigned_to) return false;
        if (
          !["all", "me", "none"].includes(filters.assignee) &&
          r.assigned_to !== filters.assignee
        )
          return false;
        return true;
      }),
    [rows, filters.client, filters.platform, filters.assignee, meId],
  );

  const visible = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return scoped.filter((r) => {
      if (!inFocus(r, filters.focus, moved[r.id] ?? r.status)) return false;
      if (!q) return true;
      return [
        r.app_name,
        r.project_name,
        r.client_name,
        r.ticket,
        r.release_label,
        r.build_version,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [scoped, filters.q, filters.focus, moved]);

  // `current` is passed by Undo, whose closure would otherwise read stale state.
  function move(
    row: AppRow,
    to: AppStatus,
    { quiet = false, current }: { quiet?: boolean; current?: AppStatus } = {},
  ) {
    const from = current ?? statusOf(row);
    if (from === to) return;
    setMoved((m) => ({ ...m, [row.id]: to }));
    start(async () => {
      const res = await setAppStatus(row.id, to);
      if (!res.ok) {
        setMoved((m) => ({ ...m, [row.id]: from }));
        toast.error(`Couldn't move ${row.app_name || row.project_name}: ${res.error}`);
        return;
      }
      if (!quiet) {
        toast.success(`${row.app_name || row.project_name} → ${STATUSES[to].label}`, {
          action: {
            label: "Undo",
            onClick: () => move(row, from, { quiet: true, current: to }),
          },
        });
      }
      router.refresh();
    });
  }

  function onDrop(e: DragEvent, to: AppStatus) {
    e.preventDefault();
    setOverColumn(null);
    const row = rows.find((r) => r.id === e.dataTransfer.getData("text/plain"));
    if (row) move(row, to);
    setDragId(null);
  }

  const preview = previewId ? rows.find((r) => r.id === previewId) : undefined;
  const filtered = (Object.keys(defaults) as (keyof Filters)[]).some(
    (k) => filters[k] !== defaults[k],
  );

  // Unassigned work is everyone's problem, so it ignores the person filter.
  const focusCounts = {
    attention: scoped.filter((r) => inFocus(r, "attention", statusOf(r))).length,
    stuck: scoped.filter((r) => inFocus(r, "stuck", statusOf(r))).length,
    unassigned: rows.filter((r) => !r.assigned_to && statusOf(r) !== "production").length,
  };

  return (
    <>
      {/* what needs someone, at a glance */}
      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        {FOCUS.map((f) => {
          const on = filters.focus === f.key;
          const count = focusCounts[f.key];
          return (
            <button
              key={f.key}
              type="button"
              onClick={() =>
                update(
                  on
                    ? { focus: "all" }
                    : f.key === "unassigned"
                      ? { focus: f.key, assignee: "all" }
                      : { focus: f.key },
                )
              }
              aria-pressed={on}
              className={`flex items-center gap-3 rounded-xl border bg-card px-3.5 py-2.5 text-left shadow-xs transition-colors ${
                on ? "border-foreground ring-1 ring-foreground" : "hover:border-ring/60"
              }`}
            >
              <span
                className={`text-[22px] font-semibold tabular-nums ${
                  count && f.key !== "unassigned"
                    ? f.key === "attention"
                      ? "text-bad"
                      : "text-warn"
                    : ""
                }`}
              >
                {count}
              </span>
              <span className="min-w-0 leading-tight">
                <span className="block text-[13px] font-medium">{f.label}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {on ? "Showing only these — click to clear" : f.hint}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-60">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={filters.q}
            onChange={(e) => update({ q: e.target.value })}
            placeholder="Filter apps…"
            className="field h-8 pl-8"
          />
        </div>

        <FilterSelect
          value={filters.assignee}
          onChange={(assignee) => update({ assignee })}
          label="Assignee"
          options={[
            { value: "all", label: "Everyone" },
            ...(meId ? [{ value: "me", label: "Assigned to me" }] : []),
            { value: "none", label: "Unassigned" },
            "---",
            ...team.map((m) => ({ value: m.id, label: m.name })),
          ]}
        />
        <FilterSelect
          value={filters.client}
          onChange={(client) => update({ client })}
          label="Client"
          options={[
            { value: "all", label: "All clients" },
            "---",
            ...clients.map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
        <FilterSelect
          value={filters.platform}
          onChange={(platform) => update({ platform })}
          label="Store"
          options={[
            { value: "all", label: "Both stores" },
            { value: "play_store", label: PLATFORMS.play_store.label },
            { value: "app_store", label: PLATFORMS.app_store.label },
          ]}
        />

        {filtered && (
          <button className="btn btn-ghost" onClick={() => update(defaults)}>
            Clear
          </button>
        )}
        <span className="ml-auto text-[12px] text-muted-foreground">
          {visible.length} {visible.length === 1 ? "app" : "apps"} · drag a card to change its
          status
        </span>
      </div>

      {/* columns */}
      <div className="-mx-4 overflow-x-auto px-4 pb-4 lg:-mx-5 lg:px-5">
        {/* Equal columns that fill the width (scrolling below 260px each) and the
            height, so the whole dotted area accepts a drop. */}
        <div className="grid min-h-[calc(100dvh-20rem)] auto-cols-[minmax(260px,1fr)] grid-flow-col items-stretch gap-3">
          {PIPELINE_ORDER.map((status) => {
            const meta = STATUSES[status];
            let cards = visible
              .filter((r) => statusOf(r) === status)
              .sort((a, b) => a.status_changed_at.localeCompare(b.status_changed_at));
            let hidden = 0;
            if (status === "production" && !showAllLive) {
              const recent = cards.filter(
                (r) => moved[r.id] || daysSince(r.status_changed_at) <= RECENT_LIVE_DAYS,
              );
              hidden = cards.length - recent.length;
              cards = recent;
            }
            // Newest live first; everything else oldest-waiting first.
            if (status === "production") cards.reverse();

            return (
              <section
                key={status}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (overColumn !== status) setOverColumn(status);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverColumn(null);
                }}
                onDrop={(e) => onDrop(e, status)}
                className={`flex min-w-0 flex-col rounded-xl border-2 border-dashed transition-colors ${
                  overColumn === status && dragId
                    ? "border-foreground/40 bg-muted"
                    : dragId
                      ? "border-border bg-muted/50"
                      : "border-border/80 bg-muted/30"
                }`}
              >
                <header className="flex items-center gap-2 px-3 py-2.5">
                  <StatusGlyph status={status} size={12} />
                  <h2 className="text-[13px] font-semibold">{meta.label}</h2>
                  <span className="rounded-full bg-background px-1.5 text-[11px] font-medium tabular-nums text-muted-foreground ring-1 ring-border">
                    {cards.length + hidden}
                  </span>
                </header>

                <div className="flex flex-1 flex-col gap-3 px-2 pb-2">
                  {groupByClient(cards).map((group) => {
                    const key = `${status}:${group.clientId}`;
                    const card = (r: AppRow) => (
                      <BoardCard
                        key={r.id}
                        row={r}
                        badge={badges[r.project_name]}
                        status={statusOf(r)}
                        live={liveNow(r) ? (stores[r.product_id] ?? null) : null}
                        dragging={dragId === r.id}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", r.id);
                          e.dataTransfer.effectAllowed = "move";
                          setDragId(r.id);
                        }}
                        onDragEnd={() => {
                          setDragId(null);
                          setOverColumn(null);
                        }}
                        onOpen={() => setPreviewId(r.id)}
                        onMove={(to) => move(r, to)}
                      />
                    );
                    // One app needs no group around it.
                    if (group.rows.length === 1) {
                      return (
                        <div key={group.clientId} className="space-y-1.5">
                          <GroupLabel group={group} />
                          {card(group.rows[0])}
                        </div>
                      );
                    }
                    // A search shows its matches without a click.
                    const expanded = open.has(key) || !!filters.q.trim();
                    return (
                      <ClientGroup
                        key={group.clientId}
                        liveCount={group.rows.filter(liveNow).length}
                        group={group}
                        status={status}
                        statusOf={statusOf}
                        badges={badges}
                        expanded={expanded}
                        onToggle={() => toggle(key)}
                      >
                        {group.rows.map(card)}
                      </ClientGroup>
                    );
                  })}

                  {cards.length === 0 && (
                    <p className="px-3 py-6 text-center text-[12px] text-muted-foreground">
                      {dragId ? "Drop here" : hidden ? "Nothing live recently" : "Nothing here"}
                    </p>
                  )}

                  {status === "production" && (hidden > 0 || showAllLive) && (
                    <button
                      className="btn btn-ghost h-7 text-[12px]"
                      onClick={() => setShowAllLive((v) => !v)}
                    >
                      {showAllLive
                        ? `Only the last ${RECENT_LIVE_DAYS} days`
                        : `Show ${hidden} older live`}
                    </button>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {preview && (
        <AppPreviewSheet
          open
          onClose={() => setPreviewId(null)}
          app={{ ...preview, status: statusOf(preview) }}
          accountLabel={`${PLATFORMS[preview.platform].label} — ${
            preview.account_name || "unnamed account"
          }`}
          assigneeName={preview.assignee_name}
          keystore={(preview.keystore_id && keystoreById.get(preview.keystore_id)) || null}
          images={images[preview.product_id] ?? null}
          store={stores[preview.product_id] ?? null}
          releaseVersion={preview.release_version}
          platform={preview.platform}
          publish={
            publishing[preview.product_id] && !publishing[preview.product_id].product.archived ? (
              <DrawerPublishButton
                client={publishing[preview.product_id].client}
                product={publishing[preview.product_id].product}
                platform={preview.platform}
                accountName={preview.account_name}
                badge={badges[preview.project_name]}
                mode={publishing[preview.product_id].update ? "update" : "publish"}
                version={expectedVersion(preview.build_version, preview.release_version) || undefined}
              />
            ) : null
          }
        />
      )}
    </>
  );
}

function BoardCard({
  row,
  badge,
  status,
  live,
  dragging,
  onDragStart,
  onDragEnd,
  onOpen,
  onMove,
}: {
  row: AppRow;
  badge?: LineBadge;
  status: AppStatus;
  /** Set when the store already shows this release and it's waiting to be moved to Production. */
  live: StoreInfo | null;
  dragging: boolean;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: () => void;
  onOpen: () => void;
  onMove: (to: AppStatus) => void;
}) {
  const days = daysSince(row.status_changed_at);
  const stale = isStale(status, row.status_changed_at);

  return (
    <article
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a, button, [role=menuitem]")) return;
        onOpen();
      }}
      className={`group cursor-grab overflow-hidden rounded-lg border bg-card p-2.5 shadow-xs transition
                  hover:border-ring/60 hover:shadow-sm active:cursor-grabbing ${
                    dragging ? "opacity-40" : ""
                  } ${
                    live
                      ? "ring-2 ring-[var(--st-production)]/50 shadow-[0_0_0_4px_color-mix(in_oklch,var(--st-production)_12%,transparent)]"
                      : ""
                  }`}
      style={{ borderLeftColor: STATUSES[status].hex, borderLeftWidth: 3 }}
    >
      <div className="flex items-start gap-2">
        <ProjectLogo badge={badge} project={row.project_name} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold">
            {row.app_name || row.project_name}
          </div>
          <div className="truncate text-[12px] text-muted-foreground">
            {row.build_version ? `v${row.build_version.split("+")[0]} · ` : ""}
            {row.project_name}
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Card actions"
            className="btn btn-ghost -mr-1 -mt-0.5 size-6 px-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
          >
            <MoreHorizontalIcon className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel className="text-[11px] text-muted-foreground">
              Move to
            </DropdownMenuLabel>
            <StatusMenuItems current={status} onPick={onMove} />
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="text-[13px]">
              <Link href={`/releases/${row.release_id}`}>Open release</Link>
            </DropdownMenuItem>
            {row.store_url && (
              <DropdownMenuItem asChild className="text-[13px]">
                <a href={row.store_url} target="_blank" rel="noreferrer">
                  Store listing <ExternalLinkIcon className="ml-auto size-3.5" />
                </a>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-2 flex items-center gap-1.5">
        <StoreIcon platform={row.platform} size={13} />
        {row.build_version && (
          <span className="truncate font-mono text-[11px] text-muted-foreground">
            {row.build_version}
          </span>
        )}
        <span
          className={`ml-auto text-[11px] tabular-nums ${
            stale ? "font-semibold text-warn" : "text-muted-foreground"
          }`}
          title={`${days} days in ${STATUSES[status].label}`}
        >
          {days}d
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={`grid size-5 place-items-center rounded-full text-[9px] font-semibold uppercase ${
                row.assignee_name
                  ? "bg-primary text-primary-foreground"
                  : "border border-dashed text-muted-foreground"
              }`}
            >
              {row.assignee_name ? initials(row.assignee_name) : "?"}
            </span>
          </TooltipTrigger>
          <TooltipContent>{row.assignee_name ?? "Unassigned"}</TooltipContent>
        </Tooltip>
      </div>

      {/* The store already has this release — say so, loudly, with the one click it needs. */}
      {live && (
        <div className="-mx-2.5 -mb-2.5 mt-2.5 border-t border-[var(--st-production)]/25 bg-good-soft px-2.5 py-2">
          <div className="flex items-center gap-1.5">
            <span className="relative flex size-2 shrink-0">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--st-production)] opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-[var(--st-production)]" />
            </span>
            <StoreIcon platform={row.platform} size={12} />
            <span className="truncate text-[12px] font-semibold text-good">
              Live on {PLATFORMS[row.platform].label}
            </span>
            {live.version && (
              <span className="ml-auto shrink-0 rounded bg-card px-1.5 font-mono text-[11px] font-semibold text-good ring-1 ring-[var(--st-production)]/30">
                v{live.version}
              </span>
            )}
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <span
              className="truncate text-[11px] text-muted-foreground"
              title={live.updatedAt ? `The store updated it ${new Date(live.updatedAt).toLocaleString()}` : undefined}
            >
              {live.updatedAt ? timeAgo(live.updatedAt) : "now"}
            </span>
            <button
              type="button"
              onClick={() => onMove("production")}
              className="shrink-0 rounded-md bg-[var(--st-production)] px-2 py-1 text-[11px] font-semibold text-white shadow-sm transition hover:brightness-110"
              title="Mark it Production in the tracker"
            >
              Move to Production →
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

/**
 * Keep a client's cards together within a column. Groups appear in the order
 * their first card did, so the column's sort (oldest waiting first) still
 * decides which client comes first.
 */
function groupByClient(rows: AppRow[]) {
  const groups = new Map<
    string,
    { clientId: string; clientName: string; ticket: string; rows: AppRow[] }
  >();
  for (const r of rows) {
    const g = groups.get(r.client_id);
    if (g) g.rows.push(r);
    else {
      groups.set(r.client_id, {
        clientId: r.client_id,
        clientName: r.client_name,
        ticket: r.ticket,
        rows: [r],
      });
    }
  }
  return [...groups.values()];
}

type Group = ReturnType<typeof groupByClient>[number];

function GroupLabel({ group }: { group: Group }) {
  return (
    <div className="flex items-center gap-1.5 px-1 pt-1">
      <span className="truncate text-[11px] font-semibold">{group.clientName}</span>
      <span className="font-mono text-[10px] text-muted-foreground">#{group.ticket}</span>
    </div>
  );
}

/** The cards peeking out behind a folded stack: offset, smaller, fainter, blurrier. */
const STACK_LAYERS = [
  "translate-y-[7px] scale-x-[0.94] opacity-80 blur-[0.6px] group-hover/stack:translate-y-[10px]",
  "translate-y-[14px] scale-x-[0.88] opacity-50 blur-[1.2px] group-hover/stack:translate-y-[19px]",
];
const PEEK = 7;
const EASE = "ease-[cubic-bezier(0.22,1,0.36,1)]";

/**
 * A client's apps in one column, folded into a stack of cards: the top one
 * says who it is, which products and stores, how long the oldest has waited
 * and who's on it; the ones behind show there are more. Clicking spreads the
 * stack — the back cards sink away and the apps slide out from under the top
 * card one by one; folding plays it in reverse.
 */
function ClientGroup({
  group,
  status,
  statusOf,
  badges,
  liveCount,
  expanded,
  onToggle,
  children,
}: {
  group: Group;
  status: AppStatus;
  statusOf: (r: AppRow) => AppStatus;
  badges: Record<string, LineBadge>;
  /** How many of its apps the store already shows live. */
  liveCount: number;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode[];
}) {
  const projects = [...new Set(group.rows.map((r) => r.project_name))];
  const stores = [...new Set(group.rows.map((r) => r.platform))];
  const people = [...new Set(group.rows.map((r) => r.assignee_name ?? ""))];
  const oldest = Math.max(...group.rows.map((r) => daysSince(r.status_changed_at)));
  const stale = group.rows.some((r) => isStale(statusOf(r), r.status_changed_at));
  const layers = STACK_LAYERS.slice(0, Math.min(group.rows.length - 1, STACK_LAYERS.length));
  const count = children.length;
  const peek = expanded ? 0 : layers.length * PEEK;

  return (
    <div className="group/stack">
      <div
        className={`relative isolate transition-[padding] duration-300 ${EASE}`}
        style={{ paddingBottom: peek }}
      >
        {/* the cards behind; they sink under the top card as the stack opens */}
        {layers.map((cls, i) => (
          <div
            key={i}
            aria-hidden
            className={`pointer-events-none absolute inset-x-0 top-0 rounded-lg border border-foreground/15 bg-card shadow-sm transition-all duration-300 ${EASE} ${
              expanded ? "translate-y-0 scale-x-[0.8] opacity-0 blur-sm" : cls
            }`}
            style={{ bottom: peek, zIndex: -1 - i }}
          />
        ))}

        {/* the top card: the client's summary, which stays as the header when open */}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={`${group.clientName}: ${group.rows.length} apps — ${expanded ? "fold" : "show them"}`}
          className={`relative z-10 flex w-full flex-col rounded-lg border bg-card p-2.5 text-left outline-none transition-all duration-300 ${EASE} hover:border-ring/60 focus-visible:ring-2 focus-visible:ring-ring ${
            expanded ? "shadow-xs" : "shadow-sm hover:shadow-md"
          }`}
          style={{ borderLeftColor: STATUSES[status].hex, borderLeftWidth: 3 }}
        >
          <span className="flex w-full items-center gap-1.5">
            <span className="truncate text-[13px] font-semibold">{group.clientName}</span>
            {liveCount > 0 && !expanded && (
              <span
                className="shrink-0 rounded-full bg-good-soft px-1.5 text-[10px] font-semibold text-good"
                title="The store already shows these — move them to Production"
              >
                {liveCount} live
              </span>
            )}
            <span className="font-mono text-[10px] text-muted-foreground">#{group.ticket}</span>
            <span className="ml-auto flex items-center gap-0.5 rounded-full bg-muted px-1.5 text-[11px] font-medium tabular-nums text-muted-foreground">
              {expanded ? "Fold" : `${group.rows.length} apps`}
              <ChevronRightIcon
                className={`size-3 transition-transform duration-300 ${expanded ? "-rotate-90" : "rotate-90"}`}
              />
            </span>
          </span>

          {/* the summary line folds away when open — the cards say it all */}
          <span
            className={`grid w-full transition-[grid-template-rows,opacity] duration-300 ${EASE} ${
              expanded ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
            }`}
          >
            <span className="min-h-0 overflow-hidden">
              <span className="flex w-full items-center gap-1.5 pt-2">
                <span className="flex -space-x-1.5">
                  {projects.slice(0, 4).map((p) => (
                    <span key={p} className="rounded ring-2 ring-card">
                      <ProjectLogo badge={badges[p]} project={p} size="xs" />
                    </span>
                  ))}
                </span>
                {projects.length > 4 && (
                  <span className="text-[11px] text-muted-foreground">+{projects.length - 4}</span>
                )}
                <span className="flex items-center gap-1 pl-1">
                  {stores.map((s) => (
                    <StoreIcon key={s} platform={s} size={13} />
                  ))}
                </span>
                <span
                  className={`ml-auto text-[11px] tabular-nums ${
                    stale ? "font-semibold text-warn" : "text-muted-foreground"
                  }`}
                  title={`Oldest has waited ${oldest} days in ${STATUSES[status].label}`}
                >
                  {oldest}d
                </span>
                <span className="flex -space-x-1">
                  {people.slice(0, 3).map((name) => (
                    <span
                      key={name || "none"}
                      title={name || "Unassigned"}
                      className={`grid size-5 place-items-center rounded-full text-[9px] font-semibold uppercase ring-2 ring-card ${
                        name
                          ? "bg-primary text-primary-foreground"
                          : "border border-dashed bg-card text-muted-foreground"
                      }`}
                    >
                      {name ? initials(name) : "?"}
                    </span>
                  ))}
                </span>
              </span>
            </span>
          </span>
        </button>
      </div>

      {/* the apps: the space opens while each card slides out from under the top one */}
      <div
        inert={!expanded}
        className={`grid transition-[grid-template-rows] duration-300 ${EASE} ${
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="-mx-1 min-h-0 overflow-hidden px-1">
          <div className="space-y-1.5 pb-1 pt-1.5">
            {children.map((child, i) => (
              <div
                key={i}
                className={`transition-all duration-300 ${EASE} ${
                  expanded
                    ? "translate-y-0 scale-100 opacity-100 blur-0"
                    : "-translate-y-6 scale-95 opacity-0 blur-[2px]"
                }`}
                // Open top to bottom; fold bottom to top.
                style={{
                  transitionDelay: `${(expanded ? i : count - 1 - i) * 40}ms`,
                }}
              >
                {child}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

type Option = { value: string; label: string } | "---";

function FilterSelect({
  value,
  onChange,
  label,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  options: Option[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size="sm" aria-label={label} className="h-8 min-w-36 bg-card text-[13px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o, i) =>
          o === "---" ? (
            <SelectSeparator key={`sep-${i}`} />
          ) : (
            <SelectItem key={o.value} value={o.value} className="text-[13px]">
              {o.label}
            </SelectItem>
          ),
        )}
      </SelectContent>
    </Select>
  );
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2);
  return words[0][0] + words[1][0];
}
