import { PageHeader } from "@/components/PageHeader";
import { NewClientWizard } from "@/components/dialogs/NewClientWizard";
import { ClientsList, type ClientCard } from "@/components/ClientsList";
import {
  getClients,
  getProductLines,
  getTeam,
  projectSuggestions,
  teamIndex,
} from "@/lib/queries";
import { PLATFORMS, releaseLabel, releaseState } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const [clients, roster, lines] = await Promise.all([
    getClients(),
    getTeam(),
    getProductLines(),
  ]);
  const wizard = (
    <NewClientWizard lines={lines} suggestions={projectSuggestions(lines, clients)} />
  );
  const names = teamIndex(roster);

  // Flattened to just what the card renders, so the client bundle stays small.
  const cards: ClientCard[] = clients.map((c) => {
    const latest = c.releases[0];
    return {
      id: c.id,
      ticket: c.ticket,
      name: c.name,
      accounts: c.publisher_accounts.map((a) => ({
        platform: a.platform,
        label: PLATFORMS[a.platform].label,
        accountName: a.account_name,
      })),
      releaseCount: c.releases.length,
      totalApps: c.products.filter((p) => !p.archived).length,
      latest: latest
        ? {
            id: latest.id,
            label: releaseLabel(latest),
            state: releaseState(latest.apps),
            assignee: (latest.assigned_to && names.get(latest.assigned_to)) || null,
            date: latest.released_on ?? latest.started_on,
          }
        : null,
    };
  });

  return (
    <>
      <PageHeader
        title="Clients"
        meta={`${clients.length} active engagements`}
      />

      {clients.length === 0 ? (
        <div className="card px-6 py-16 text-center">
          <p className="text-[15px] font-semibold">No clients yet.</p>
          <p className="mx-auto mt-1 max-w-md text-[13px] text-muted-foreground">
            Set one up — client, stores, apps and keystore in one go — and its first release
            starts right away.
          </p>
          <div className="mt-5 flex justify-center">
            {wizard}
          </div>
        </div>
      ) : (
        <ClientsList clients={cards} />
      )}
    </>
  );
}
