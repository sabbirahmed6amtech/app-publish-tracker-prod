"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type MouseEvent } from "react";
import {
  CheckIcon,
  ChevronDownIcon,
  KeyboardIcon,
  LinkIcon,
  Loader2Icon,
  MailIcon,
  MailOpenIcon,
  MousePointerClickIcon,
  RotateCcwIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { KindLabel, MemberAvatar, SourceIcon, StatusIcon, type LinkTarget } from "@/components/MailList";
import { StoreIcon } from "@/components/StoreIcon";
import { TicketPane } from "@/components/mail/TicketPane";
import { cleanSubject, shortAgo, ticketRef, when } from "@/lib/mailRules";
import {
  assignTicket,
  linkTicketToProduct,
  loadTicket,
  markTicketsRead,
  markTicketsUnread,
  setTicketStatus,
  type TicketDetail,
} from "@/lib/mailActions";
import { filtersFor, type FilterKey } from "@/lib/mailFilters";
import type { MailTicket } from "@/lib/types";

type Member = { id: string; name: string };
type Group = "none" | "app" | "client";
type Menu = { kind: "assign" | "link"; number: number } | null;

const appOf = (t: MailTicket) => (t.product_id ? t.app_name || t.project_name : null);

function groupKey(t: MailTicket, g: Group): string {
  if (g === "client") return t.client_name ?? "No client";
  const app = appOf(t);
  if (app) return t.client_name ? `${app} · ${t.client_name}` : app;
  return t.app_label ? `“${t.app_label}” · no app linked` : "No app linked";
}

function searchText(t: MailTicket): string {
  return [ticketRef(t.number), t.subject, t.app_name, t.project_name, t.app_label, t.client_name, t.assignee_name]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function typingIn(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

function overlayOpen(): boolean {
  return !!document.querySelector('[role="menu"], [role="dialog"], [role="listbox"][data-state="open"]');
}

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = useCallback(
    (fn: () => Promise<{ ok: boolean; error?: string }>, success?: string) =>
      start(async () => {
        const res = await fn();
        if (!res.ok) return void toast.error(res.error ?? "Something went wrong");
        if (success) toast.success(success);
        router.refresh();
      }),
    [router],
  );
  return [pending, run] as const;
}

function AssignControl({
  t,
  members,
  meId,
  open,
  onOpenChange,
}: {
  t: MailTicket;
  members: Member[];
  meId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [pending, run] = useRun();
  const assign = (id: string | null, name: string | null) =>
    id !== t.assigned_to &&
    run(() => assignTicket(t.id, id), name ? `${ticketRef(t.number)} assigned to ${name}` : `${ticketRef(t.number)} unassigned`);
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger
        disabled={pending}
        aria-label={t.assignee_name ? `Owner: ${t.assignee_name}. Change owner` : "Assign an owner"}
        className="grid size-8 place-items-center rounded-md transition-colors hover:bg-muted disabled:opacity-50"
      >
        <MemberAvatar name={t.assignee_name} size={22} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {meId && meId !== t.assigned_to && (
          <>
            <DropdownMenuItem className="text-[14px] font-medium" onSelect={() => assign(meId, "you")}>
              Assign to me
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem className="gap-2 text-[14px]" onSelect={() => assign(null, null)}>
          <MemberAvatar name={null} />
          <span className="text-muted-foreground">Unassigned</span>
          {!t.assigned_to && <CheckIcon className="ml-auto size-3.5" />}
        </DropdownMenuItem>
        {members.map((m) => (
          <DropdownMenuItem key={m.id} className="gap-2 text-[14px]" onSelect={() => assign(m.id, m.name)}>
            <MemberAvatar name={m.name} />
            <span className="truncate">{m.name}</span>
            {m.id === t.assigned_to && <CheckIcon className="ml-auto size-3.5" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function LinkControl({
  t,
  targets,
  open,
  onOpenChange,
}: {
  t: MailTicket;
  targets: LinkTarget[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [pending, run] = useRun();
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={pending}
          aria-label={`Link ${ticketRef(t.number)} to an app`}
          className="inline-flex h-8 items-center gap-1 rounded-md border border-dashed px-2 text-[12px] text-muted-foreground transition-colors hover:border-ring hover:text-foreground disabled:opacity-50"
        >
          <LinkIcon className="size-3.5" /> Link app
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="end">
        <Command>
          <CommandInput placeholder="Search apps or clients…" aria-label="Search apps or clients" />
          <CommandList>
            <CommandEmpty>No app found.</CommandEmpty>
            {targets.map((target) => (
              <CommandItem
                key={target.id}
                value={`${target.name} ${target.client} ${target.id}`}
                onSelect={() => {
                  onOpenChange(false);
                  run(
                    () => linkTicketToProduct(t.id, target.id),
                    `Linked to ${target.name}. Later emails with this name will match too.`,
                  );
                }}
                className="gap-2 text-[14px]"
              >
                <StoreIcon platform={target.platform} size={12} />
                <span className="truncate">{target.name}</span>
                <span className="ml-auto truncate text-[12px] text-muted-foreground">{target.client}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function ResolveControl({ t }: { t: MailTicket }) {
  const [pending, run] = useRun();
  const resolved = t.status === "resolved";
  return (
    <button
      type="button"
      disabled={pending}
      aria-label={resolved ? `Reopen ${ticketRef(t.number)}` : `Resolve ${ticketRef(t.number)}`}
      title={resolved ? "Reopen" : "Resolve (E)"}
      onClick={() =>
        run(
          () => setTicketStatus(t.id, resolved ? "open" : "resolved"),
          `${ticketRef(t.number)} ${resolved ? "reopened" : "resolved"}`,
        )
      }
      className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-[var(--st-production)]/10 hover:text-[var(--st-production)] disabled:opacity-50"
    >
      {resolved ? <RotateCcwIcon className="size-4" /> : <CheckIcon className="size-4" />}
    </button>
  );
}

function TicketRow({
  t,
  href,
  selected,
  checked,
  onCheck,
  members,
  meId,
  targets,
  menu,
  setMenu,
  onOpen,
}: {
  t: MailTicket;
  href: string;
  onOpen: () => void;
  selected: boolean;
  checked: boolean;
  onCheck: (on: boolean) => void;
  members: Member[];
  meId: string | null;
  targets: LinkTarget[];
  menu: Menu;
  setMenu: (menu: Menu) => void;
}) {
  const app = appOf(t);
  const stamp = t.status === "resolved" && t.resolved_at ? t.resolved_at : t.last_mail_at;
  return (
    <li
      data-ticket={t.number}
      className={`group relative flex items-start gap-2 border-b px-3 py-2.5 transition-colors last:border-b-0 ${
        selected ? "bg-muted" : checked ? "bg-muted/50" : "hover:bg-muted/40"
      }`}
    >
      {selected && <span className="absolute inset-y-0 left-0 w-0.5 bg-primary" aria-hidden />}
      <span className="grid size-8 shrink-0 place-items-center">
        <Checkbox checked={checked} onCheckedChange={(v) => onCheck(v === true)} aria-label={`Select ${ticketRef(t.number)}`} />
      </span>
      <Link
        href={href}
        scroll={false}
        onClick={(event: MouseEvent<HTMLAnchorElement>) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
          event.preventDefault();
          onOpen();
        }}
        aria-current={selected ? "true" : undefined}
        className="min-w-0 flex-1 rounded-md py-0.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <span
            className={`size-2 shrink-0 rounded-full ${t.unread ? "bg-[var(--st-ongoing)]" : "bg-transparent"}`}
            role={t.unread ? "img" : undefined}
            aria-label={t.unread ? "Unread" : undefined}
          />
          <StatusIcon status={t.status} size={13} />
          {t.platform ? <StoreIcon platform={t.platform} size={12} /> : <SourceIcon source={t.source} size={12} />}
          <span
            className={`truncate text-[14px] ${t.unread ? "font-semibold text-foreground" : "font-medium text-foreground/75"} ${app ? "" : "italic"}`}
          >
            {app ?? (t.app_label ? `“${t.app_label}”` : "Unknown app")}
          </span>
          {t.client_name && <span className="truncate text-[12px] text-muted-foreground">{t.client_name}</span>}
          <time dateTime={stamp} title={when(stamp)} suppressHydrationWarning className="ml-auto shrink-0 pl-2 text-[12px] tabular-nums text-muted-foreground">
            {shortAgo(stamp)}
          </time>
        </span>
        <span className={`mt-0.5 block truncate text-[14px] ${t.unread ? "font-medium text-foreground" : "text-muted-foreground"}`}>
          {cleanSubject(t.subject, t.app_label)}
        </span>
        <span className="mt-1 flex items-center gap-2.5 text-[12px] text-muted-foreground">
          <KindLabel kind={t.kind} />
          {t.mail_count > 1 && (
            <span className="inline-flex items-center gap-1 tabular-nums" title={`${t.mail_count} emails`}>
              <MailIcon className="size-3" aria-hidden />
              {t.mail_count}
            </span>
          )}
          <span className="font-mono">{ticketRef(t.number)}</span>
        </span>
      </Link>
      <span className="flex shrink-0 items-center gap-0.5 self-center">
        {!t.product_id && t.status !== "resolved" && (
          <LinkControl
            t={t}
            targets={targets}
            open={menu?.kind === "link" && menu.number === t.number}
            onOpenChange={(open) => setMenu(open ? { kind: "link", number: t.number } : null)}
          />
        )}
        <AssignControl
          t={t}
          members={members}
          meId={meId}
          open={menu?.kind === "assign" && menu.number === t.number}
          onOpenChange={(open) => setMenu(open ? { kind: "assign", number: t.number } : null)}
        />
        <ResolveControl t={t} />
      </span>
    </li>
  );
}

function BulkBar({
  selected,
  members,
  meId,
  onClear,
  onSetRead,
}: {
  selected: MailTicket[];
  members: Member[];
  meId: string | null;
  onClear: () => void;
  onSetRead: (unread: boolean) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const each = (label: string, fn: (t: MailTicket) => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      let failed = 0;
      for (const t of selected) {
        const res = await fn(t);
        if (!res.ok) failed += 1;
      }
      const done = selected.length - failed;
      if (done) toast.success(`${done} ${done === 1 ? "ticket" : "tickets"} ${label}`);
      if (failed) toast.error(`${failed} couldn't be updated`);
      onClear();
      router.refresh();
    });
  return (
    <div
      role="region"
      aria-label="Bulk actions"
      className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 border-t bg-card/95 px-3 py-2 backdrop-blur"
    >
      <span className="text-[12px] font-medium tabular-nums">{selected.length} selected</span>
      <DropdownMenu>
        <DropdownMenuTrigger className="btn btn-secondary h-8" disabled={pending}>
          Assign <ChevronDownIcon className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {meId && (
            <>
              <DropdownMenuItem className="text-[14px] font-medium" onSelect={() => each("assigned to you", (t) => assignTicket(t.id, meId))}>
                Assign to me
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          {members.map((m) => (
            <DropdownMenuItem key={m.id} className="gap-2 text-[14px]" onSelect={() => each(`assigned to ${m.name}`, (t) => assignTicket(t.id, m.id))}>
              <MemberAvatar name={m.name} />
              <span className="truncate">{m.name}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-[14px] text-muted-foreground" onSelect={() => each("unassigned", (t) => assignTicket(t.id, null))}>
            Unassign
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <button type="button" className="btn btn-secondary h-8" disabled={pending} onClick={() => onSetRead(false)}>
        <MailOpenIcon className="size-3.5" /> Mark read
      </button>
      <button type="button" className="btn btn-secondary h-8" disabled={pending} onClick={() => onSetRead(true)}>
        <MailIcon className="size-3.5" /> Mark unread
      </button>
      <button type="button" className="btn btn-secondary h-8" disabled={pending} onClick={() => each("marked in progress", (t) => setTicketStatus(t.id, "in_progress"))}>
        In progress
      </button>
      <button type="button" className="btn btn-primary h-8" disabled={pending} onClick={() => each("resolved", (t) => setTicketStatus(t.id, "resolved"))}>
        <CheckIcon className="size-3.5" /> Resolve
      </button>
      <button type="button" className="btn btn-ghost ml-auto h-8" onClick={onClear} disabled={pending}>
        <XIcon className="size-3.5" /> Clear
      </button>
    </div>
  );
}

const SHORTCUTS: [string, string][] = [
  ["J / ↓", "Next ticket"],
  ["K / ↑", "Previous ticket"],
  ["X", "Select or unselect the open ticket"],
  ["A", "Assign the open ticket"],
  ["L", "Link the open ticket to an app"],
  ["E", "Resolve the open ticket"],
  ["U", "Mark the open ticket read or unread"],
  ["/", "Search"],
  ["Esc", "Clear selection"],
  ["?", "Show these shortcuts"],
];

export function MailWorkspace({
  tickets: serverTickets,
  members,
  meId,
  targets,
  me,
  initialSelected,
  initialDetail,
  initialFilter,
  initialGroup,
}: {
  tickets: MailTicket[];
  members: Member[];
  meId: string | null;
  targets: LinkTarget[];
  me: string | null;
  initialSelected: number | null;
  initialDetail: TicketDetail | null;
  initialFilter: FilterKey | null;
  initialGroup: Group;
}) {
  const [selected, setSelected] = useState<number | null>(initialSelected);
  const [detail, setDetail] = useState<TicketDetail | null>(initialDetail);
  const [loading, setLoading] = useState(false);
  const request = useRef(0);
  const firstTickets = useRef(true);
  const [readOverride, setReadOverride] = useState<Map<number, boolean>>(new Map());
  const autoRead = useRef<number | null>(null);
  const tickets = useMemo(
    () => serverTickets.map((t) => (readOverride.has(t.number) ? { ...t, unread: readOverride.get(t.number)! } : t)),
    [serverTickets, readOverride],
  );

  useEffect(() => setReadOverride(new Map()), [serverTickets]);

  const setRead = useCallback(
    (numbers: number[], unread: boolean, silent = false) => {
      if (numbers.length === 0) return;
      const set = new Set(numbers);
      setReadOverride((prev) => {
        const next = new Map(prev);
        for (const n of numbers) next.set(n, unread);
        return next;
      });
      const ids = serverTickets.filter((t) => set.has(t.number)).map((t) => t.id);
      (unread ? markTicketsUnread : markTicketsRead)(ids).then((res) => {
        if (!res.ok) {
          toast.error(res.error);
          setReadOverride((prev) => {
            const next = new Map(prev);
            for (const n of numbers) next.delete(n);
            return next;
          });
          return;
        }
        if (!silent) {
          const what = numbers.length === 1 ? ticketRef(numbers[0]!) : `${numbers.length} tickets`;
          toast.success(`${what} marked ${unread ? "unread" : "read"}`);
        }
      });
    },
    [serverTickets],
  );
  const [now] = useState(() => Date.now());
  const filters = useMemo(() => filtersFor(meId, now), [meId, now]);
  const counts = useMemo(
    () => Object.fromEntries(filters.map((f) => [f.key, tickets.filter(f.test).length])) as Record<FilterKey, number>,
    [filters, tickets],
  );
  const [filter, setFilter] = useState<FilterKey>(initialFilter ?? (counts.triage > 0 ? "triage" : "open"));
  const [group, setGroup] = useState<Group>(initialGroup);
  const [query, setQuery] = useState("");
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [menu, setMenu] = useState<Menu>(null);
  const [help, setHelp] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const hrefFor = useCallback(
    (n: number | null) => {
      const p = new URLSearchParams();
      p.set("f", filter);
      if (group !== "none") p.set("g", group);
      if (n !== null) p.set("t", String(n));
      return `/mail?${p.toString()}`;
    },
    [filter, group],
  );

  useEffect(() => {
    const url = hrefFor(selected);
    if (url !== window.location.pathname + window.location.search) window.history.replaceState(null, "", url);
  }, [hrefFor, selected]);

  const shown = useMemo(() => {
    const test = filters.find((f) => f.key === filter)!.test;
    const q = query.trim().toLowerCase();
    return tickets.filter((t) => test(t) && (!q || searchText(t).includes(q)));
  }, [tickets, filters, filter, query]);

  const groups = useMemo(() => {
    if (group === "none") return [{ key: "", items: shown }];
    const map = new Map<string, MailTicket[]>();
    for (const t of shown) {
      const k = groupKey(t, group);
      map.set(k, [...(map.get(k) ?? []), t]);
    }
    return [...map.entries()]
      .map(([key, items]) => ({ key, items }))
      .sort((a, b) => b.items.length - a.items.length || a.key.localeCompare(b.key));
  }, [shown, group]);

  const ordered = useMemo(
    () => groups.flatMap((g) => (group !== "none" && collapsed.has(g.key) ? [] : g.items)),
    [groups, group, collapsed],
  );
  const selectedTicket = tickets.find((t) => t.number === selected) ?? null;
  const checkedTickets = tickets.filter((t) => checked.has(t.number));

  const load = useCallback(async (n: number, quiet = false) => {
    const id = ++request.current;
    if (!quiet) setLoading(true);
    const next = await loadTicket(n).catch(() => null);
    if (id !== request.current) return;
    setDetail(next);
    setLoading(false);
  }, []);

  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  useEffect(() => {
    if (firstTickets.current) {
      firstTickets.current = false;
      return;
    }
    if (selectedRef.current !== null) load(selectedRef.current, true);
  }, [serverTickets, load]);

  useEffect(() => {
    if (selected === null) {
      autoRead.current = null;
      return;
    }
    if (detail?.ticket.number !== selected || autoRead.current === selected) return;
    autoRead.current = selected;
    if (tickets.find((t) => t.number === selected)?.unread) setRead([selected], false, true);
  }, [selected, detail, tickets, setRead]);

  const go = useCallback(
    (n: number) => {
      setSelected(n);
      setMenu(null);
      if (detail?.ticket.number !== n) load(n);
      requestAnimationFrame(() =>
        listRef.current?.querySelector(`[data-ticket="${n}"]`)?.scrollIntoView({ block: "nearest" }),
      );
    },
    [detail, load],
  );

  const toggle = (n: number, on: boolean) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (on) next.add(n);
      else next.delete(n);
      return next;
    });

  const [, runKey] = useRun();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "Escape" && document.activeElement === searchRef.current) {
        searchRef.current?.blur();
        return;
      }
      if (typingIn(event.target) || overlayOpen()) return;
      const index = ordered.findIndex((t) => t.number === selected);
      const key = event.key;
      if (key === "j" || key === "ArrowDown") {
        event.preventDefault();
        const next = ordered[Math.min(index + 1, ordered.length - 1)] ?? ordered[0];
        if (next) go(next.number);
      } else if (key === "k" || key === "ArrowUp") {
        event.preventDefault();
        const prev = ordered[Math.max(index - 1, 0)];
        if (prev) go(prev.number);
      } else if (key === "/") {
        event.preventDefault();
        searchRef.current?.focus();
      } else if (key === "?") {
        event.preventDefault();
        setHelp(true);
      } else if (key === "Escape") {
        setChecked(new Set());
      } else if (selectedTicket && key === "x") {
        event.preventDefault();
        toggle(selectedTicket.number, !checked.has(selectedTicket.number));
      } else if (selectedTicket && key === "a") {
        event.preventDefault();
        setMenu({ kind: "assign", number: selectedTicket.number });
      } else if (selectedTicket && key === "l" && !selectedTicket.product_id) {
        event.preventDefault();
        setMenu({ kind: "link", number: selectedTicket.number });
      } else if (selectedTicket && key === "u") {
        event.preventDefault();
        setRead([selectedTicket.number], !selectedTicket.unread);
      } else if (selectedTicket && key === "e" && selectedTicket.status !== "resolved") {
        event.preventDefault();
        runKey(() => setTicketStatus(selectedTicket.id, "resolved"), `${ticketRef(selectedTicket.number)} resolved`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ordered, selected, selectedTicket, checked, go, runKey, setRead]);

  const triage = filters.filter((f) => f.group === "triage");
  const views = filters.filter((f) => f.group === "view");
  const chip = (f: (typeof filters)[number]) => {
    const active = f.key === filter;
    const count = counts[f.key];
    const alert = f.group === "triage" && count > 0;
    return (
      <button
        key={f.key}
        type="button"
        aria-pressed={active}
        onClick={() => {
          setFilter(f.key);
          setChecked(new Set());
        }}
        className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition-colors ${
          active
            ? "border-foreground bg-foreground text-background"
            : "bg-card text-foreground/80 hover:border-ring hover:text-foreground"
        }`}
      >
        {f.label}
        <span
          className={`min-w-5 rounded-full px-1.5 text-center tabular-nums ${
            active ? "bg-background/20" : alert ? "bg-bad-soft text-bad" : "bg-muted text-muted-foreground"
          }`}
        >
          {count}
        </span>
      </button>
    );
  };

  const emptyText =
    query.trim()
      ? "No tickets match your search."
      : filter === "triage"
        ? "Nothing to triage — every open ticket has an app and an owner."
        : filter === "resolved"
          ? "No resolved tickets yet."
          : filter === "mine"
            ? "Nothing assigned to you."
            : "No tickets here.";

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 rounded-xl border bg-card p-2 sm:flex-row sm:items-center">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 sm:pb-0" role="group" aria-label="Needs attention">
          <span className="px-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Triage</span>
          {triage.map(chip)}
        </div>
        <span className="hidden h-6 w-px bg-border sm:block" aria-hidden />
        <div className="flex items-center gap-1.5 overflow-x-auto" role="group" aria-label="Views">
          {views.map(chip)}
        </div>
      </div>

      <div className="grid items-start gap-3 lg:h-[calc(100dvh-15rem)] lg:min-h-[560px] lg:grid-cols-[minmax(360px,440px)_minmax(0,1fr)]">
        <section
          aria-label="Tickets"
          className={`flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card lg:h-full ${selected ? "hidden lg:flex" : "flex"}`}
        >
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <label className="relative min-w-0 flex-1">
              <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search  /"
                aria-label="Search tickets, apps and clients"
                className="h-8 w-full rounded-md border bg-background pl-8 pr-2 text-[14px] outline-none placeholder:text-muted-foreground focus:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </label>
            <DropdownMenu>
              <DropdownMenuTrigger className="btn btn-ghost h-8 px-2 text-[12px]" aria-label="Group tickets">
                {group === "none" ? "No grouping" : group === "app" ? "By app" : "By client"}
                <ChevronDownIcon className="size-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                {(["none", "app", "client"] as Group[]).map((g) => (
                  <DropdownMenuItem key={g} className="text-[14px]" onSelect={() => setGroup(g)}>
                    {g === "none" ? "No grouping" : g === "app" ? "By app" : "By client"}
                    {g === group && <CheckIcon className="ml-auto size-3.5" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <button type="button" className="btn btn-ghost size-8 px-0" aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)" onClick={() => setHelp(true)}>
              <KeyboardIcon className="size-4" />
            </button>
          </div>

          <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-1.5 text-[12px] text-muted-foreground">
            <Checkbox
              checked={shown.length > 0 && shown.every((t) => checked.has(t.number)) ? true : shown.some((t) => checked.has(t.number)) ? "indeterminate" : false}
              onCheckedChange={(v) => setChecked(v === true ? new Set(shown.map((t) => t.number)) : new Set())}
              aria-label="Select all shown tickets"
              className="ml-2"
            />
            <span className="ml-2 tabular-nums">
              {shown.length} {shown.length === 1 ? "ticket" : "tickets"}
            </span>
          </div>

          <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
            {shown.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
                <span className="grid size-10 place-items-center rounded-full bg-[var(--st-production)]/10 text-[var(--st-production)]">
                  <CheckIcon className="size-5" />
                </span>
                <p className="text-[14px] font-medium">{query.trim() ? "No matches" : "All clear"}</p>
                <p className="max-w-[260px] text-[12px] text-muted-foreground">{emptyText}</p>
                {filter !== "open" && !query.trim() && (
                  <button type="button" className="btn btn-secondary mt-1 h-8" onClick={() => setFilter("open")}>
                    Show all open tickets
                  </button>
                )}
              </div>
            ) : (
              groups.map((g) => {
                const isCollapsed = group !== "none" && collapsed.has(g.key);
                return (
                  <div key={g.key || "all"}>
                    {group !== "none" && (
                      <div className="sticky top-0 z-[5] flex items-center gap-2 border-b bg-muted/80 px-3 py-1.5 backdrop-blur">
                        <Checkbox
                          checked={g.items.every((t) => checked.has(t.number)) ? true : g.items.some((t) => checked.has(t.number)) ? "indeterminate" : false}
                          onCheckedChange={(v) =>
                            setChecked((prev) => {
                              const next = new Set(prev);
                              for (const t of g.items) {
                                if (v === true) next.add(t.number);
                                else next.delete(t.number);
                              }
                              return next;
                            })
                          }
                          aria-label={`Select all in ${g.key}`}
                          className="ml-2"
                        />
                        <button
                          type="button"
                          aria-expanded={!isCollapsed}
                          onClick={() =>
                            setCollapsed((prev) => {
                              const next = new Set(prev);
                              if (next.has(g.key)) next.delete(g.key);
                              else next.add(g.key);
                              return next;
                            })
                          }
                          className="ml-1 flex min-w-0 flex-1 items-center gap-1.5 text-left text-[12px] font-semibold"
                        >
                          <ChevronDownIcon className={`size-3.5 shrink-0 transition-transform ${isCollapsed ? "-rotate-90" : ""}`} />
                          <span className="truncate">{g.key}</span>
                          <span className="tabular-nums font-normal text-muted-foreground">{g.items.length}</span>
                        </button>
                      </div>
                    )}
                    {!isCollapsed && (
                      <ul>
                        {g.items.map((t) => (
                          <TicketRow
                            key={t.id}
                            t={t}
                            href={hrefFor(t.number)}
                            selected={t.number === selected}
                            checked={checked.has(t.number)}
                            onCheck={(on) => toggle(t.number, on)}
                            members={members}
                            meId={meId}
                            targets={targets}
                            menu={menu}
                            setMenu={setMenu}
                            onOpen={() => go(t.number)}
                          />
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {checkedTickets.length > 0 && (
            <BulkBar
              selected={checkedTickets}
              members={members}
              meId={meId}
              onClear={() => setChecked(new Set())}
              onSetRead={(unread) => {
                setRead(checkedTickets.map((t) => t.number), unread);
                setChecked(new Set());
              }}
            />
          )}
        </section>

        <section
          aria-label="Ticket"
          className={`min-h-0 overflow-hidden rounded-xl border bg-card lg:h-full ${selected ? "block" : "hidden lg:block"}`}
        >
          <div className="relative h-full overflow-y-auto">
            {selected === null ? (
              <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3 px-8 text-center">
                <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
                  <MousePointerClickIcon className="size-5" />
                </span>
                <p className="text-[14px] font-medium">Pick a ticket to see its emails and notes</p>
                <p className="max-w-[320px] text-[12px] text-muted-foreground">
                  Link apps, assign owners and resolve straight from the list. Press{" "}
                  <kbd className="rounded border bg-muted px-1 font-mono">J</kbd> to start at the top, or{" "}
                  <kbd className="rounded border bg-muted px-1 font-mono">?</kbd> for all shortcuts.
                </p>
              </div>
            ) : detail && detail.ticket.number === selected ? (
              <TicketPane
                key={detail.ticket.id}
                ticket={detail.ticket}
                mails={detail.mails}
                events={detail.events}
                members={
                  detail.ticket.assigned_to && !members.some((m) => m.id === detail.ticket.assigned_to)
                    ? [...members, { id: detail.ticket.assigned_to, name: detail.ticket.assignee_name ?? "Former member" }]
                    : members
                }
                meId={meId}
                me={me}
                targets={targets}
                onBack={() => setSelected(null)}
                unread={!!selectedTicket?.unread}
                onToggleRead={() => selectedTicket && setRead([selectedTicket.number], !selectedTicket.unread)}
              />
            ) : loading ? (
              <div role="status" className="flex h-full min-h-[320px] items-center justify-center gap-2 text-[14px] text-muted-foreground">
                <Loader2Icon className="size-4 animate-spin motion-reduce:animate-none" /> Loading {ticketRef(selected)}…
              </div>
            ) : (
              <div className="flex h-full min-h-[320px] items-center justify-center px-8 text-center text-[14px] text-muted-foreground">
                That ticket doesn&apos;t exist any more.
              </div>
            )}
            {loading && detail && detail.ticket.number === selected && (
              <div className="pointer-events-none absolute right-3 top-3">
                <Loader2Icon className="size-4 animate-spin text-muted-foreground motion-reduce:animate-none" />
              </div>
            )}
          </div>
        </section>
      </div>

      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent className="max-w-sm">
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Work through tickets without the mouse.</DialogDescription>
          <dl className="mt-2 divide-y">
            {SHORTCUTS.map(([k, label]) => (
              <div key={k} className="flex items-center justify-between py-2 text-[14px]">
                <dt>{label}</dt>
                <dd>
                  <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[12px]">{k}</kbd>
                </dd>
              </div>
            ))}
          </dl>
        </DialogContent>
      </Dialog>
    </div>
  );
}
