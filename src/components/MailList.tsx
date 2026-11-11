"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CloudIcon, ExternalLinkIcon, FlameIcon, LinkIcon, MailIcon, SearchIcon } from "lucide-react";
import { toast } from "sonner";
import { StoreIcon } from "@/components/StoreIcon";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  MAIL_KINDS,
  TICKET_STATUSES,
  TONE_DOT,
  gmailLink,
  cleanSubject,
  initials,
  shortAgo,
  ticketRef,
  when,
  type MailSource,
  type TicketStatus,
} from "@/lib/mailRules";
import { linkTicketToProduct } from "@/lib/mailActions";
import type { MailTicket, Platform, StoreMail } from "@/lib/types";

export type LinkTarget = { id: string; name: string; client: string; platform: Platform };

export function StatusIcon({ status, size = 14 }: { status: TicketStatus; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 16 16",
    fill: "none",
    className: "shrink-0",
    role: "img" as const,
    "aria-label": TICKET_STATUSES[status].label,
  };
  if (status === "resolved") {
    return (
      <svg {...common} style={{ color: "var(--st-production)" }}>
        <circle cx="8" cy="8" r="7" fill="currentColor" />
        <path d="m5 8.2 2 2 4-4.2" stroke="var(--card)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (status === "in_progress") {
    return (
      <svg {...common} style={{ color: "var(--st-in-review)" }}>
        <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 4a4 4 0 0 1 0 8Z" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg {...common} className="shrink-0 text-muted-foreground">
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function StatusLabel({ status }: { status: TicketStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px]">
      <StatusIcon status={status} />
      {TICKET_STATUSES[status].label}
    </span>
  );
}

export function KindLabel({ kind, className = "" }: { kind: StoreMail["kind"]; className?: string }) {
  const meta = MAIL_KINDS[kind] ?? MAIL_KINDS.other;
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 text-[12px] text-foreground/75 ${className}`}>
      <span className={`size-1.5 shrink-0 rounded-full ${TONE_DOT[meta.tone]}`} />
      <span className="truncate">{meta.label}</span>
    </span>
  );
}

export function MemberAvatar({ name, size = 20 }: { name: string | null; size?: number }) {
  if (!name) {
    return (
      <span
        title="Unassigned"
        style={{ width: size, height: size }}
        className="inline-block shrink-0 rounded-full border border-dashed border-muted-foreground/50"
      />
    );
  }
  return (
    <span
      title={name}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-foreground/10 font-semibold text-foreground/80"
    >
      {initials(name)}
    </span>
  );
}

export function SourceIcon({ source, size = 14 }: { source: MailSource; size?: number }) {
  if (source === "app_store" || source === "play_store") return <StoreIcon platform={source} size={size} />;
  const Icon = source === "firebase" ? FlameIcon : source === "google_cloud" ? CloudIcon : MailIcon;
  return <Icon className="shrink-0 text-muted-foreground" style={{ width: size, height: size }} />;
}

type AppFields = Pick<
  MailTicket,
  "product_id" | "app_label" | "platform" | "app_name" | "project_name" | "client_id" | "client_name"
>;

function appName(item: AppFields): string | null {
  return item.product_id ? item.app_name || item.project_name : null;
}

export function AppRef({ item, linkClient = true }: { item: AppFields; linkClient?: boolean }) {
  const name = appName(item);
  if (!name) {
    return (
      <span className="truncate text-[12px] italic text-muted-foreground">
        {item.app_label ? `“${item.app_label}”, unmatched` : "Unmatched"}
      </span>
    );
  }
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-[12px]">
      {item.platform && <StoreIcon platform={item.platform} size={12} />}
      <span className="truncate text-foreground/80">{name}</span>
      {item.client_name &&
        (linkClient && item.client_id ? (
          <Link
            href={`/clients/${item.client_id}?tab=mail`}
            className="truncate text-muted-foreground hover:text-foreground hover:underline"
          >
            {item.client_name}
          </Link>
        ) : (
          <span className="truncate text-muted-foreground">{item.client_name}</span>
        ))}
    </span>
  );
}

export function LinkPicker({ ticketId, targets }: { ticketId: string; targets: LinkTarget[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="btn btn-secondary h-7 px-2 text-[12px]" disabled={pending}>
          <LinkIcon className="size-3.5" /> Link to app
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="end">
        <Command>
          <CommandInput placeholder="Search apps or clients…" />
          <CommandList>
            <CommandEmpty>No app found.</CommandEmpty>
            {targets.map((t) => (
              <CommandItem
                key={t.id}
                value={`${t.name} ${t.client} ${t.id}`}
                onSelect={() =>
                  start(async () => {
                    setOpen(false);
                    const res = await linkTicketToProduct(ticketId, t.id);
                    if (!res.ok) return void toast.error(res.error);
                    toast.success(`Linked to ${t.name}. Future emails with this name will match too.`);
                    router.refresh();
                  })
                }
                className="gap-2 text-[13px]"
              >
                <StoreIcon platform={t.platform} size={12} />
                <span className="truncate">{t.name}</span>
                <span className="ml-auto truncate text-[11px] text-muted-foreground">{t.client}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function GmailButton({
  mail,
  label = "Gmail",
  className = "btn btn-ghost h-7 px-2 text-[12px]",
}: {
  mail: Pick<StoreMail, "mailbox" | "gmail_id" | "thread_id">;
  label?: string;
  className?: string;
}) {
  return (
    <a href={gmailLink(mail.mailbox, mail.gmail_id, mail.thread_id)} target="_blank" rel="noreferrer" className={className}>
      {label} <ExternalLinkIcon className="size-3.5" />
    </a>
  );
}

function Ago({ iso }: { iso: string }) {
  return (
    <time
      dateTime={iso}
      title={when(iso)}
      suppressHydrationWarning
      className="shrink-0 text-right text-[12px] tabular-nums text-muted-foreground"
    >
      {shortAgo(iso)}
    </time>
  );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="relative block w-full sm:max-w-[280px]">
      <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 w-full rounded-md border bg-background pl-8 pr-2.5 text-[13px] outline-none placeholder:text-muted-foreground focus:border-ring"
      />
    </label>
  );
}

function ticketText(t: MailTicket): string {
  return [
    ticketRef(t.number),
    t.subject,
    t.app_name,
    t.project_name,
    t.app_label,
    t.client_name,
    t.assignee_name,
    MAIL_KINDS[t.kind]?.label,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

const GROUP_ORDER: TicketStatus[] = ["open", "in_progress", "resolved"];

function TicketRow({ t }: { t: MailTicket }) {
  const name = appName(t) ?? t.app_label;
  return (
    <li>
      <Link
        href={`/mail/${t.number}`}
        className="flex items-start gap-3.5 px-5 py-3.5 transition-colors hover:bg-muted/50"
      >
        <span className="pt-[3px]">
          <StatusIcon status={t.status} size={15} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            {t.platform ? (
              <StoreIcon platform={t.platform} size={13} />
            ) : (
              <SourceIcon source={t.source} size={13} />
            )}
            <span className="truncate text-[14px] font-semibold text-foreground">{name ?? "Unknown app"}</span>
            {t.client_name && <span className="truncate text-[13px] text-muted-foreground">{t.client_name}</span>}
          </span>
          <span className="mt-1 block truncate text-[13px] text-muted-foreground">
            {cleanSubject(t.subject, t.app_label)}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1.5 pt-0.5">
          <span className="flex items-center gap-3">
            <KindLabel kind={t.kind} className="hidden sm:inline-flex" />
            <Ago iso={t.status === "resolved" && t.resolved_at ? t.resolved_at : t.last_mail_at} />
          </span>
          <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
            {t.mail_count > 1 && (
              <span className="inline-flex items-center gap-1 tabular-nums" title={`${t.mail_count} emails`}>
                <MailIcon className="size-3" />
                {t.mail_count}
              </span>
            )}
            <span className="font-mono">{ticketRef(t.number)}</span>
            {t.assignee_name && <MemberAvatar name={t.assignee_name} size={18} />}
          </span>
        </span>
      </Link>
    </li>
  );
}

export function TicketList({
  tickets,
  grouped = true,
  empty,
}: {
  tickets: MailTicket[];
  grouped?: boolean;
  empty: string;
}) {
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? tickets.filter((t) => ticketText(t).includes(q)) : tickets;
  }, [tickets, query]);

  const split = grouped
    ? GROUP_ORDER.map((s) => ({ status: s, items: shown.filter((t) => t.status === s) })).filter((g) => g.items.length)
    : [];
  const groups = split.length > 1 ? split : [{ status: null, items: shown }];

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3">
        <SearchBox value={query} onChange={setQuery} placeholder="Search tickets, apps, clients…" />
        <span className="text-[12px] tabular-nums text-muted-foreground">
          {shown.length} {shown.length === 1 ? "ticket" : "tickets"}
        </span>
      </div>
      {shown.length === 0 ? (
        <p className="px-4 py-12 text-center text-[13px] text-muted-foreground">
          {query ? "No tickets match your search." : empty}
        </p>
      ) : (
        groups.map((g) => (
          <div key={g.status ?? "all"}>
            {g.status && (
              <div className="flex items-center gap-2 border-b bg-muted/40 px-5 py-2 text-[12px] font-medium">
                <StatusIcon status={g.status} size={13} />
                {TICKET_STATUSES[g.status].label}
                <span className="tabular-nums text-muted-foreground">{g.items.length}</span>
              </div>
            )}
            <ul className="divide-y border-b last:border-b-0">
              {g.items.map((t) => (
                <TicketRow key={t.id} t={t} />
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}

export function MailFeed({ mails, showApp = true }: { mails: StoreMail[]; showApp?: boolean }) {
  return (
    <ul className="divide-y">
      {mails.map((m) => (
        <li key={m.id} className="flex items-center gap-3 px-4 py-2.5">
          <SourceIcon source={m.source} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] text-foreground" title={m.subject}>
              {m.subject}
            </div>
            <div className="mt-0.5 flex min-w-0 items-center gap-2">
              <KindLabel kind={m.kind} />
              {showApp && <AppRef item={m} />}
            </div>
          </div>
          {m.ticket_number && m.ticket_status && (
            <Link
              href={`/mail/${m.ticket_number}`}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 font-mono text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <StatusIcon status={m.ticket_status} size={12} />
              {ticketRef(m.ticket_number)}
            </Link>
          )}
          <Ago iso={m.received_at} />
          <a
            href={gmailLink(m.mailbox, m.gmail_id, m.thread_id)}
            target="_blank"
            rel="noreferrer"
            title="Open in Gmail"
            className="btn btn-ghost size-7 shrink-0 p-0"
          >
            <ExternalLinkIcon className="size-3.5" />
          </a>
        </li>
      ))}
    </ul>
  );
}
