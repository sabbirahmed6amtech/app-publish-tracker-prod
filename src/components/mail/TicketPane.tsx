"use client";

import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import {
  GmailButton,
  KindLabel,
  LinkPicker,
  MemberAvatar,
  SourceIcon,
  type LinkTarget,
} from "@/components/MailList";
import { StoreIcon } from "@/components/StoreIcon";
import { AssigneeMenu, NoteComposer, ResolveButton, StatusMenu } from "@/components/TicketControls";
import { MAIL_SOURCES, cleanSubject, senderName, ticketRef, when } from "@/lib/mailRules";
import type { MailTicket, StoreMail, TicketEvent } from "@/lib/types";

type Entry =
  | { type: "mail"; at: string; mail: StoreMail }
  | { type: "event"; at: string; event: TicketEvent };

type Block = Entry | { type: "run"; events: TicketEvent[] };

function eventText(e: TicketEvent): string {
  if (e.kind === "reopened") return "reopened this after a new email arrived";
  if (!e.body) return e.kind;
  return e.body.charAt(0).toLowerCase() + e.body.slice(1);
}

function foldUpdates(entries: Entry[]): Block[] {
  const blocks: Block[] = [];
  let run: TicketEvent[] = [];
  const flush = () => {
    if (run.length > 2) blocks.push({ type: "run", events: run });
    else blocks.push(...run.map((event) => ({ type: "event" as const, at: event.created_at, event })));
    run = [];
  };
  for (const entry of entries) {
    if (entry.type === "event" && entry.event.kind !== "note") {
      run.push(entry.event);
      continue;
    }
    flush();
    blocks.push(entry);
  }
  flush();
  return blocks;
}

function MailEntry({ mail }: { mail: StoreMail }) {
  return (
    <li className="relative flex gap-3">
      <span className="z-10 flex size-8 shrink-0 items-center justify-center rounded-full border bg-card">
        <SourceIcon source={mail.source} size={15} />
      </span>
      <article className="min-w-0 flex-1 overflow-hidden rounded-lg border bg-card">
        <header className="flex items-center gap-2 border-b bg-muted/30 px-3 py-1.5">
          <span className="truncate text-[12px] font-medium">{senderName(mail.sender)}</span>
          <span className="shrink-0 text-[12px] text-muted-foreground">{when(mail.received_at)}</span>
          <GmailButton mail={mail} label="Open" className="btn btn-ghost ml-auto h-7 px-2 text-[12px]" />
        </header>
        <div className="space-y-1.5 px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h3 className="text-[14px] font-medium [overflow-wrap:anywhere]">{mail.subject}</h3>
            <KindLabel kind={mail.kind} />
          </div>
          {mail.snippet && (
            <p className="whitespace-pre-line text-[14px] leading-relaxed text-foreground/80 [overflow-wrap:anywhere]">
              {mail.snippet}
            </p>
          )}
        </div>
      </article>
    </li>
  );
}

function NoteEntry({ event }: { event: TicketEvent }) {
  return (
    <li className="relative flex gap-3">
      <span className="z-10 rounded-full bg-background">
        <MemberAvatar name={event.actor ?? "Store mail"} size={32} />
      </span>
      <article className="min-w-0 flex-1 overflow-hidden rounded-lg border border-[var(--st-in-review)]/30 bg-[var(--st-in-review)]/5">
        <header className="flex items-center gap-2 border-b border-[var(--st-in-review)]/20 px-3 py-1.5 text-[12px]">
          <span className="font-medium">{event.actor ?? "Someone"}</span>
          <span className="text-muted-foreground">left a note · {when(event.created_at)}</span>
        </header>
        <p className="whitespace-pre-wrap px-3 py-2.5 text-[14px] leading-relaxed [overflow-wrap:anywhere]">{event.body}</p>
      </article>
    </li>
  );
}

function EventEntry({ event }: { event: TicketEvent }) {
  return (
    <li className="relative flex items-center gap-3">
      <span className="z-10 flex size-8 shrink-0 items-center justify-center">
        <span className="size-2 rounded-full bg-muted-foreground/40 ring-4 ring-background" />
      </span>
      <p className="min-w-0 text-[12px] text-muted-foreground">
        <span className="font-medium text-foreground">{event.actor ?? "Store mail"}</span> {eventText(event)}
        <span className="mx-1.5">·</span>
        {when(event.created_at)}
      </p>
    </li>
  );
}

function UpdateRun({ events }: { events: TicketEvent[] }) {
  const last = events[events.length - 1]!;
  return (
    <li className="relative">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
          <span className="z-10 flex size-8 shrink-0 items-center justify-center">
            <span className="size-2 rounded-full bg-muted-foreground/40 ring-4 ring-background" />
          </span>
          <span className="text-[12px] text-muted-foreground hover:text-foreground">
            {events.length} updates, latest: <span className="text-foreground">{last.actor ?? "Store mail"}</span>{" "}
            {eventText(last)}
            <span className="ml-1.5 group-open:hidden">· show all</span>
          </span>
        </summary>
        <ol className="mt-2 space-y-2">
          {events.map((event) => (
            <EventEntry key={event.id} event={event} />
          ))}
        </ol>
      </details>
    </li>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className="text-[12px] text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right text-[12px]">{children}</dd>
    </div>
  );
}

export function TicketPane({
  ticket,
  mails,
  events,
  members,
  meId,
  me,
  targets,
  onBack,
}: {
  ticket: MailTicket;
  mails: StoreMail[];
  events: TicketEvent[];
  members: { id: string; name: string }[];
  meId: string | null;
  me: string | null;
  targets: LinkTarget[];
  onBack: () => void;
}) {
  const timeline: Entry[] = [
    ...mails.map((mail) => ({ type: "mail" as const, at: mail.received_at, mail })),
    ...events
      .filter((event) => event.kind !== "opened" && event.kind !== "mail")
      .map((event) => ({ type: "event" as const, at: event.created_at, event })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const latest = mails[0];
  const appName = ticket.product_id ? ticket.app_name || ticket.project_name : null;

  return (
    <article aria-labelledby="ticket-title" className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 space-y-3 border-b bg-card/95 px-5 py-4 backdrop-blur">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground lg:hidden">
          <ArrowLeftIcon className="size-3.5" /> All tickets
        </button>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
          <span className="font-mono text-foreground">{ticketRef(ticket.number)}</span>
          <KindLabel kind={ticket.kind} />
          <span className="inline-flex items-center gap-1.5">
            <SourceIcon source={ticket.source} size={12} />
            {MAIL_SOURCES[ticket.source]}
          </span>
          <span>opened {when(ticket.opened_at)}</span>
        </div>
        <h2 id="ticket-title" className="text-[20px] font-semibold leading-snug tracking-tight [overflow-wrap:anywhere]">
          {cleanSubject(ticket.subject, ticket.app_label)}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <StatusMenu ticketId={ticket.id} status={ticket.status} />
          <span className="h-5 w-px bg-border" aria-hidden />
          <AssigneeMenu ticketId={ticket.id} assignedTo={ticket.assigned_to} members={members} meId={meId} />
          <span className="h-5 w-px bg-border" aria-hidden />
          {appName ? (
            <span className="inline-flex min-w-0 items-center gap-1.5 text-[14px]">
              {ticket.platform && <StoreIcon platform={ticket.platform} size={13} />}
              <span className="truncate">{appName}</span>
              {ticket.client_id && (
                <Link href={`/clients/${ticket.client_id}?tab=mail`} className="truncate text-muted-foreground hover:text-foreground hover:underline">
                  {ticket.client_name}
                </Link>
              )}
            </span>
          ) : (
            <span className="inline-flex items-center gap-2">
              <span className="text-[12px] text-muted-foreground">
                {ticket.app_label ? `“${ticket.app_label}” matches no app` : "No app named"}
              </span>
              <LinkPicker ticketId={ticket.id} targets={targets} />
            </span>
          )}
          <span className="ml-auto flex items-center gap-2">
            {latest && <GmailButton mail={latest} label="Gmail" className="btn btn-secondary h-8" />}
            <ResolveButton ticketId={ticket.id} status={ticket.status} />
          </span>
        </div>
      </header>

      <div className="flex-1 space-y-5 px-5 py-5">
        <ol className="relative space-y-4 before:absolute before:bottom-4 before:left-4 before:top-4 before:w-px before:bg-border">
          {foldUpdates(timeline).map((entry) =>
            entry.type === "run" ? (
              <UpdateRun key={entry.events[0]!.id} events={entry.events} />
            ) : entry.type === "mail" ? (
              <MailEntry key={entry.mail.id} mail={entry.mail} />
            ) : entry.event.kind === "note" ? (
              <NoteEntry key={entry.event.id} event={entry.event} />
            ) : (
              <EventEntry key={entry.event.id} event={entry.event} />
            ),
          )}
        </ol>
        <NoteComposer ticketId={ticket.id} author={me} />

        <details className="rounded-lg border bg-muted/20 px-3 py-2">
          <summary className="cursor-pointer text-[12px] font-medium text-muted-foreground hover:text-foreground">Details</summary>
          <dl className="mt-2 divide-y">
            {ticket.package_name && (
              <Fact label="Package">
                <span className="font-mono">{ticket.package_name}</span>
              </Fact>
            )}
            <Fact label="Emails">{ticket.mail_count}</Fact>
            <Fact label="First email">{when(ticket.first_mail_at)}</Fact>
            <Fact label="Latest email">{when(ticket.last_mail_at)}</Fact>
            {ticket.resolved_at && (
              <Fact label="Resolved">
                {when(ticket.resolved_at)}
                {ticket.resolved_by ? ` by ${ticket.resolved_by}` : ""}
              </Fact>
            )}
          </dl>
        </details>
      </div>
    </article>
  );
}
