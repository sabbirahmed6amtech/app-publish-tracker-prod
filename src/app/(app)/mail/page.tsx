import Link from "next/link";
import { InboxIcon } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { MailSyncButton } from "@/components/MailSyncButton";
import { DesktopAlertsButton } from "@/components/DesktopAlertsButton";
import { MailFeed, type LinkTarget } from "@/components/MailList";
import { MailWorkspace } from "@/components/mail/MailWorkspace";
import { FILTER_KEYS, type FilterKey } from "@/lib/mailFilters";
import {
  activeMembers,
  getClients,
  getCurrentMemberId,
  getMailSyncs,
  getRecentMails,
  getTeam,
  getTicket,
  getTickets,
} from "@/lib/queries";
import { timeAgo } from "@/lib/storeWatch";

export const dynamic = "force-dynamic";

type Search = { t?: string; f?: string; g?: string; view?: string };

function ViewSwitch({ current }: { current: "tickets" | "activity" }) {
  const item = (key: "tickets" | "activity", label: string, href: string) => (
    <Link
      href={href}
      aria-current={current === key ? "page" : undefined}
      className={`inline-flex h-7 items-center rounded-md px-3 text-[12px] font-medium transition-colors ${
        current === key ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label="Store mail views" className="inline-flex items-center gap-0.5 rounded-lg border bg-muted/60 p-0.5">
      {item("tickets", "Tickets", "/mail")}
      {item("activity", "Activity", "/mail?view=activity")}
    </nav>
  );
}

function linkTargets(clients: Awaited<ReturnType<typeof getClients>>): LinkTarget[] {
  return clients.flatMap((c) => {
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

export default async function MailPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const view = params.view === "activity" ? "activity" : "tickets";
  const syncs = await getMailSyncs();
  const last = syncs[0];

  const header = (
    <PageHeader
      title="Store mail"
      meta={
        last
          ? `Last synced ${timeAgo(last.synced_at)} from ${last.mailbox} by ${last.synced_by}.`
          : "Tickets from App Store Connect, Google Play, Firebase and Google Cloud emails, matched to each app. Click Sync inbox to start."
      }
      actions={
        <>
          <ViewSwitch current={view} />
          <DesktopAlertsButton />
          <MailSyncButton className="btn btn-secondary" />
        </>
      }
    />
  );

  if (view === "activity") {
    const mails = await getRecentMails();
    return (
      <>
        {header}
        <section className="card overflow-hidden" aria-label="Recent activity">
          <div className="border-b px-4 py-2.5 text-[12px] text-muted-foreground">
            Approvals, TestFlight builds and other notices from the last 14 days. Nothing here needs action.
          </div>
          {mails.length ? (
            <MailFeed mails={mails} />
          ) : (
            <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
              <InboxIcon className="size-6 text-muted-foreground" />
              <p className="text-[14px] text-muted-foreground">No approvals, TestFlight builds or reports in the last 14 days.</p>
            </div>
          )}
        </section>
      </>
    );
  }

  const selected = Number(params.t);
  const selectedNumber = Number.isInteger(selected) && selected > 0 ? selected : null;
  const meId = await getCurrentMemberId();
  const [open, resolved, team, clients, detail] = await Promise.all([
    getTickets("open", meId),
    getTickets("resolved", meId),
    getTeam(),
    getClients(),
    selectedNumber ? getTicket(selectedNumber) : Promise.resolve(null),
  ]);

  const members = activeMembers(team).map((m) => ({ id: m.id, name: m.name }));
  const me = team.find((m) => m.id === meId)?.name ?? null;
  const targets = linkTargets(clients);
  const filter = FILTER_KEYS.includes(params.f as FilterKey) ? (params.f as FilterKey) : null;
  const group = params.g === "app" || params.g === "client" ? params.g : "none";

  return (
    <>
      {header}
      <MailWorkspace
        tickets={[...open, ...resolved]}
        members={members}
        meId={meId}
        targets={targets}
        me={me}
        initialSelected={selectedNumber}
        initialDetail={detail}
        initialFilter={filter}
        initialGroup={group}
      />
    </>
  );
}
