import { PageHeader } from "@/components/PageHeader";
import { PageTabs, pickTab } from "@/components/PageTabs";
import { MailSyncButton } from "@/components/MailSyncButton";
import { DesktopAlertsButton } from "@/components/DesktopAlertsButton";
import { MailFeed, TicketList } from "@/components/MailList";
import {
  getCurrentMemberId,
  getMailSyncs,
  getRecentMails,
  getTickets,
  ticketCounts,
  type TicketView,
} from "@/lib/queries";
import { timeAgo } from "@/lib/storeWatch";

export const dynamic = "force-dynamic";

const TABS = ["open", "mine", "unassigned", "resolved", "other"] as const;

const EMPTY: Record<(typeof TABS)[number], string> = {
  open: "No open tickets. New store issues show up here as they arrive.",
  mine: "Nothing assigned to you.",
  unassigned: "Every open ticket has an owner.",
  resolved: "No resolved tickets yet.",
  other: "No approvals, TestFlight builds or stability reports in the last 14 days.",
};

export default async function MailPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const tab = pickTab((await searchParams).tab, TABS);
  const memberId = await getCurrentMemberId();
  const [counts, syncs, tickets, other] = await Promise.all([
    ticketCounts(memberId),
    getMailSyncs(),
    tab === "other" ? Promise.resolve([]) : getTickets(tab as TicketView, memberId),
    tab === "other" ? getRecentMails() : Promise.resolve([]),
  ]);
  const last = syncs[0];

  return (
    <>
      <PageHeader
        title="Store mail"
        meta={
          last
            ? `Last synced ${timeAgo(last.synced_at)} from ${last.mailbox} by ${last.synced_by}.`
            : "Tickets from App Store Connect, Google Play, Firebase and Google Cloud emails, matched to each app. Click Sync inbox to start."
        }
        actions={
          <>
            <DesktopAlertsButton />
            <MailSyncButton className="btn btn-secondary" />
          </>
        }
      />

      <PageTabs
        base="/mail"
        current={tab}
        tabs={[
          { key: "open", label: "Open", count: counts.open },
          { key: "mine", label: "Assigned to me", count: counts.mine },
          { key: "unassigned", label: "Unassigned", count: counts.unassigned },
          { key: "resolved", label: "Resolved" },
          { key: "other", label: "Other mail" },
        ]}
      />

      {tab === "other" ? (
        <section className="card overflow-hidden">
          {other.length ? (
            <MailFeed mails={other} />
          ) : (
            <p className="px-4 py-12 text-center text-[13px] text-muted-foreground">{EMPTY.other}</p>
          )}
        </section>
      ) : (
        <TicketList key={tab} tickets={tickets} grouped={tab !== "resolved"} empty={EMPTY[tab]} />
      )}
    </>
  );
}
