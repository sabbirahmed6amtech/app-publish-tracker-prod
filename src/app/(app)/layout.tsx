import { Sidebar, type SidebarClient } from "@/components/Sidebar";
import { TopBar, type SearchItem } from "@/components/TopBar";
import { NewClientWizard } from "@/components/dialogs/NewClientWizard";
import { PageContainer } from "@/components/PageContainer";
import { MailAlerts } from "@/components/MailAlerts";
import { redirect } from "next/navigation";
import { getSession, SIGN_OUT_PATH } from "@/lib/auth";
import {
  countOpenTickets,
  getClients,
  getProductLines,
  getTeam,
  projectSuggestions,
  teamIndex,
} from "@/lib/queries";
import type { ProductLine } from "@/lib/types";
import { releaseLabel, releaseState } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // The middleware checked the cookie; this checks the login behind it still exists.
  if (!(await getSession())) redirect(SIGN_OUT_PATH);

  let clients: SidebarClient[] = [];
  let search: SearchItem[] = [];
  let lines: ProductLine[] = [];
  let suggestions: string[] = [];
  let loadError: string | null = null;
  let user: { email?: string } | null = null;
  let openMail = 0;

  try {
    // Session, roster and client tree are independent — fetch them together.
    const [auth, roster, tree, productLines, mailCount] = await Promise.all([
      getSession(),
      getTeam(),
      getClients(),
      getProductLines(),
      countOpenTickets().catch(() => 0),
    ]);
    openMail = mailCount;
    lines = productLines;
    suggestions = projectSuggestions(productLines, tree);
    user = auth ? { email: auth.email } : null;
    const names = teamIndex(roster);
    clients = tree.map((c) => ({
      id: c.id,
      ticket: c.ticket,
      name: c.name,
      platforms: [...new Set(c.publisher_accounts.map((a) => a.platform))],
      releases: c.releases.map((r) => ({
        id: r.id,
        label: releaseLabel(r),
        assignedTo: (r.assigned_to && names.get(r.assigned_to)) || null,
        appCount: r.apps.length,
        liveCount: r.apps.filter((a) => a.status === "production").length,
        state: releaseState(r.apps),
      })),
    }));
    search = tree.flatMap((c) => [
      {
        id: c.id,
        kind: "client" as const,
        label: c.name,
        sub: `#${c.ticket}`,
        href: `/clients/${c.id}`,
      },
      ...c.releases.map((r) => ({
        id: r.id,
        kind: "release" as const,
        label: `${c.name} · ${releaseLabel(r)}`,
        sub: `${r.apps.length} apps`,
        href: `/releases/${r.id}`,
      })),
      ...c.products.map((p) => ({
        id: p.id,
        kind: "app" as const,
        label: p.app_name || p.project_name,
        sub: `${c.name} · ${p.project_name}${p.archived ? " · archived" : ""}`,
        href: `/clients/${c.id}?tab=apps`,
      })),
    ]);
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <MailAlerts />
      <Sidebar clients={clients} email={user?.email ?? null} openMail={openMail} />
      <main className="min-w-0 flex-1">
        <TopBar
          items={search}
          actions={<NewClientWizard lines={lines} suggestions={suggestions} />}
        />
        <PageContainer>
          {loadError && (
            <div className="card mb-5 border-bad/30 bg-bad-soft p-4 text-[13px] text-bad">
              <strong className="font-semibold">Could not load data.</strong> {loadError}
              <div className="mt-1 text-bad">
                Is MySQL running, and has{" "}
                <code className="font-mono">database/schema.sql</code> been imported into the
                database in <code className="font-mono">DATABASE_URL</code>?
              </div>
            </div>
          )}
          {children}
        </PageContainer>
      </main>
    </div>
  );
}
