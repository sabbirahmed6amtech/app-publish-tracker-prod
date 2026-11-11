import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ChevronRightIcon } from "lucide-react";
import {
  GmailButton,
  KindLabel,
  LinkPicker,
  MemberAvatar,
  SourceIcon,
  type LinkTarget,
} from "@/components/MailList";
import { AssigneeMenu, NoteComposer, ResolveButton, StatusMenu } from "@/components/TicketControls";
import { activeMembers, getClients, getCurrentMemberId, getTeam, getTicket } from "@/lib/queries";
import { MAIL_SOURCES, cleanSubject, senderName, ticketRef, when } from "@/lib/mailRules";
import type { StoreMail, TicketEvent } from "@/lib/types";

export const dynamic = "force-dynamic";

type Entry =
  | { type: "mail"; at: string; mail: StoreMail }
  | { type: "event"; at: string; event: TicketEvent };

function eventText(e: TicketEvent): string {
  if (e.kind === "reopened") return "reopened this after a new email arrived";
  if (!e.body) return e.kind;
  return e.body.charAt(0).toLowerCase() + e.body.slice(1);
}

function Prop({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-9 items-center gap-3 px-4 py-1">
      <dt className="w-[84px] shrink-0 text-[12px] text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 text-[13px]">{children}</dd>
    </div>
  );
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
          <GmailButton mail={mail} label="Open" className="btn btn-ghost ml-auto h-6 px-1.5 text-[11px]" />
        </header>
        <div className="space-y-1.5 px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h3 className="text-[14px] font-medium">{mail.subject}</h3>
            <KindLabel kind={mail.kind} />
          </div>
          {mail.snippet && (
            <p className="whitespace-pre-line text-[13px] leading-relaxed text-foreground/80">
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
      <article className="min-w-0 flex-1 overflow-hidden rounded-lg border bg-card">
        <header className="flex items-center gap-2 border-b bg-muted/30 px-3 py-1.5 text-[12px]">
          <span className="font-medium">{event.actor ?? "Someone"}</span>
          <span className="text-muted-foreground">left a note · {when(event.created_at)}</span>
        </header>
        <p className="whitespace-pre-wrap px-3 py-2.5 text-[13px] leading-relaxed">{event.body}</p>
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

type Block = Entry | { type: "run"; events: TicketEvent[] };

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
            <span className="ml-1.5 underline-offset-2 group-open:hidden">· show all</span>
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

export default async function TicketPage({ params }: { params: Promise<{ number: string }> }) {
  const number = Number((await params).number);
  if (!Number.isInteger(number) || number < 1) notFound();
  const [data, team, meId] = await Promise.all([getTicket(number), getTeam(), getCurrentMemberId()]);
  if (!data) notFound();
  const { ticket, mails, events } = data;

  const members = activeMembers(team).map((m) => ({ id: m.id, name: m.name }));
  if (ticket.assigned_to && !members.some((m) => m.id === ticket.assigned_to)) {
    members.push({ id: ticket.assigned_to, name: ticket.assignee_name ?? "Former member" });
  }
  const me = team.find((m) => m.id === meId)?.name ?? null;

  let targets: LinkTarget[] = [];
  if (!ticket.product_id) {
    const clients = await getClients();
    targets = clients.flatMap((c) => {
      const platformOf = new Map(c.publisher_accounts.map((a) => [a.id, a.platform]));
      return c.products
        .filter((p) => !p.archived)
        .map((p) => ({
          id: p.id,
          name: p.app_name || p.project_name,
          client: c.name,
          platform: platformOf.get(p.account_id) ?? "play_store",
        }));
    });
  }

  const timeline: Entry[] = [
    ...mails.map((mail) => ({ type: "mail" as const, at: mail.received_at, mail })),
    ...events
      .filter((event) => event.kind !== "opened" && event.kind !== "mail")
      .map((event) => ({ type: "event" as const, at: event.created_at, event })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const latest = mails[0];

  return (
    <>
      <nav className="mb-3 flex items-center gap-1 text-[12px] text-muted-foreground">
        <Link href="/mail" className="hover:text-foreground">
          Store mail
        </Link>
        <ChevronRightIcon className="size-3.5" />
        <span className="font-mono text-foreground">{ticketRef(ticket.number)}</span>
      </nav>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-[20px] font-semibold leading-snug tracking-tight">
            {cleanSubject(ticket.subject, ticket.app_label)}
          </h1>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            {ticket.app_name || ticket.project_name || ticket.app_label || "Unknown app"}
            {ticket.client_name ? ` · ${ticket.client_name}` : ""} · {MAIL_SOURCES[ticket.source]} · opened{" "}
            {when(ticket.opened_at)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {latest && <GmailButton mail={latest} label="Open in Gmail" className="btn btn-secondary h-8" />}
          <ResolveButton ticketId={ticket.id} status={ticket.status} />
        </div>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-5">
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
        </div>

        <aside className="space-y-4 lg:sticky lg:top-4">
          <dl className="card divide-y py-1">
            <div className="py-1.5">
              <Prop label="Status">
                <StatusMenu ticketId={ticket.id} status={ticket.status} />
              </Prop>
              <Prop label="Assignee">
                <AssigneeMenu
                  ticketId={ticket.id}
                  assignedTo={ticket.assigned_to}
                  members={members}
                  meId={meId}
                />
              </Prop>
            </div>
            <div className="py-1.5">
              <Prop label="App">
                {ticket.product_id ? (
                  <span className="block truncate">{ticket.app_name || ticket.project_name}</span>
                ) : (
                  <div className="space-y-1.5 py-1">
                    <span className="block text-[12px] text-muted-foreground">
                      {ticket.app_label ? `“${ticket.app_label}” matches no app` : "No app named"}
                    </span>
                    <LinkPicker ticketId={ticket.id} targets={targets} />
                  </div>
                )}
              </Prop>
              {ticket.client_id && (
                <Prop label="Client">
                  <Link href={`/clients/${ticket.client_id}?tab=mail`} className="block truncate hover:underline">
                    {ticket.client_name}
                  </Link>
                </Prop>
              )}
              {ticket.package_name && (
                <Prop label="Package">
                  <span className="block truncate font-mono text-[12px]" title={ticket.package_name}>
                    {ticket.package_name}
                  </span>
                </Prop>
              )}
              <Prop label="Type">
                <KindLabel kind={ticket.kind} className="text-[13px] text-foreground" />
              </Prop>
              <Prop label="Source">
                <span className="inline-flex items-center gap-1.5">
                  <SourceIcon source={ticket.source} size={13} />
                  {MAIL_SOURCES[ticket.source]}
                </span>
              </Prop>
            </div>
            <div className="py-1.5 text-muted-foreground">
              <Prop label="Emails">{ticket.mail_count}</Prop>
              <Prop label="First email">{when(ticket.first_mail_at)}</Prop>
              <Prop label="Latest">{when(ticket.last_mail_at)}</Prop>
              {ticket.resolved_at && (
                <Prop label="Resolved">
                  {when(ticket.resolved_at)}
                  {ticket.resolved_by ? ` by ${ticket.resolved_by}` : ""}
                </Prop>
              )}
            </div>
          </dl>
        </aside>
      </div>
    </>
  );
}
