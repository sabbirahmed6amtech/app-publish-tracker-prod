import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLinkIcon, PlusIcon } from "lucide-react";
import { Tag } from "@/components/PageHeader";
import { PageTabs, pickTab } from "@/components/PageTabs";
import { DeleteButton } from "@/components/RowActions";
import { CopyButton } from "@/components/CopyButton";
import { StatusChip } from "@/components/StatusChip";
import { ReleaseView } from "@/components/ReleaseView";
import { ArchiveToggle } from "@/components/ArchiveToggle";
import { ProjectLogo } from "@/components/ProjectLogo";
import { StoreIcon } from "@/components/StoreIcon";
import { KeystoreDownloadButton } from "@/components/KeystoreDownloadButton";
import { ClientDialog } from "@/components/dialogs/ClientDialog";
import { AccountDialog } from "@/components/dialogs/AccountDialog";
import { NewRoundDialog, type RoundApp } from "@/components/dialogs/NewRoundDialog";
import { KeystoreDialog } from "@/components/dialogs/KeystoreDialog";
import { ProductDialog } from "@/components/dialogs/ProductDialog";
import { ListingDialog } from "@/components/dialogs/ListingDialog";
import { ClientPlayDialog } from "@/components/dialogs/ClientPlayDialog";
import { PublishPanel } from "@/components/PublishPanel";
import { IntakeLinkButton } from "@/components/IntakeLinkButton";
import {
  publishChecks,
  everLiveProducts,
  isFirstPublish,
  publishChecksIos,
  publishData,
  publishDataIos,
} from "@/lib/publish";
import {
  getClient,
  activeMembers,
  getProductLines,
  getTeam,
  lineBadges,
  projectSuggestions,
  teamIndex,
} from "@/lib/queries";
import { deleteAccount, deleteClient, deleteKeystore, deleteProduct } from "@/lib/actions";
import {
  ACCOUNT_TYPES,
  PLATFORMS,
  RELEASE_STATES,
  formatDate,
  releaseLabel,
  releaseState,
} from "@/lib/constants";
import { expectedVersion } from "@/lib/storeWatch";
import type { App, ClientFull, ProductLine, TeamMember } from "@/lib/types";

export const dynamic = "force-dynamic";

const TABS = ["overview", "apps", "releases", "credentials"] as const;

function roundAppsFor(client: ClientFull, lines: ProductLine[]): RoundApp[] {
  const badges = lineBadges(lines);
  const accountById = new Map(client.publisher_accounts.map((a) => [a.id, a]));
  return client.products
    .filter((p) => !p.archived)
    .map((p) => ({
      id: p.id,
      name: p.app_name || p.project_name,
      project: p.project_name,
      platform: accountById.get(p.account_id)?.platform ?? "play_store",
      badge: badges[p.project_name],
    }));
}

export default async function ClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; new?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const tab = pickTab(query.tab, TABS);

  const [client, roster, lines] = await Promise.all([
    getClient(id),
    getTeam(),
    getProductLines(),
  ]);
  if (!client) notFound();
  const suggestions = projectSuggestions(lines, [client]);

  const activeApps = client.products.filter((p) => !p.archived);
  const current = client.releases[0];

  return (
    <>
      {/* client header */}
      <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary text-[16px] font-semibold text-primary-foreground">
            {initials(client.name)}
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-[22px] font-semibold tracking-tight">{client.name}</h1>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground">
              <span className="inline-flex items-center gap-0.5 font-mono">
                Ticket #{client.ticket}
                <CopyButton value={client.ticket} label="Copy ticket" />
              </span>
              {client.publisher_accounts.map((a) => (
                <Tag key={a.id}>
                  <span className="inline-flex items-center gap-1">
                    <StoreIcon platform={a.platform} size={11} />
                    {PLATFORMS[a.platform].label}
                  </span>
                </Tag>
              ))}
              {client.note && <Tag>{client.note}</Tag>}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <IntakeLinkButton
            clientId={client.id}
            token={client.intake_token}
            submittedAt={client.intake_submitted_at}
          />
          <ClientDialog client={client} trigger="Edit" className="btn btn-secondary" />
          <NewRoundDialog
            clientId={client.id}
            apps={roundAppsFor(client, lines)}
            team={activeMembers(roster)}
            defaultOpen={query.new === "release"}
          />
        </div>
      </header>

      <PageTabs
        base={`/clients/${client.id}`}
        current={tab}
        tabs={[
          { key: "overview", label: "Current release" },
          { key: "apps", label: "Apps", count: activeApps.length },
          { key: "releases", label: "Releases", count: client.releases.length },
          {
            key: "credentials",
            label: "Credentials",
            count: client.publisher_accounts.length + client.keystores.length,
          },
        ]}
      />

      {tab === "overview" && (
        <OverviewTab client={client} roster={roster} lines={lines} suggestions={suggestions} />
      )}
      {tab === "apps" && <AppsTab client={client} lines={lines} suggestions={suggestions} />}
      {tab === "releases" && <ReleasesTab client={client} roster={roster} lines={lines} />}
      {tab === "credentials" && <CredentialsTab client={client} />}

      {tab === "overview" && current && (
        <p className="mt-3 text-[12px] text-muted-foreground">
          Older releases are under{" "}
          <Link
            href={`/clients/${client.id}?tab=releases`}
            className="font-medium text-foreground hover:underline"
          >
            Releases
          </Link>
          .
        </p>
      )}
    </>
  );
}

// ------------------------------------------------------------------- tabs --

function OverviewTab({
  client,
  roster,
  lines,
  suggestions,
}: {
  client: ClientFull;
  roster: TeamMember[];
  lines: ProductLine[];
  suggestions: string[];
}) {
  const current = client.releases[0];
  const hasApps = client.products.some((p) => !p.archived);

  if (!hasApps) {
    return (
      <EmptyState
        title="This client has no apps yet"
        body="Add the apps you publish for them once — every new release then submits all of them with one click."
        action={
          <ProductDialog
            clientId={client.id}
            accounts={client.publisher_accounts}
            keystores={client.keystores}
            suggestions={suggestions}
            trigger={
              <>
                <PlusIcon className="size-4" /> Add app
              </>
            }
            className="btn btn-primary"
          />
        }
      />
    );
  }

  if (!current) {
    return (
      <EmptyState
        title="No release yet"
        body="Start one to submit this client's apps. It's assigned to you, and every app starts as Ongoing."
        action={<NewRoundDialog clientId={client.id} apps={roundAppsFor(client, lines)} team={activeMembers(roster)} />}
      />
    );
  }

  return (
    <ReleaseView
      release={current}
      client={client}
      accounts={client.publisher_accounts}
      keystores={client.keystores}
      products={client.products}
      siblings={client.releases}
      roster={roster}
      lines={lines}
      everLive={[...everLiveProducts(client.releases.flatMap((r) => r.apps))]}
    />
  );
}

function AppsTab({
  client,
  lines,
  suggestions,
}: {
  client: ClientFull;
  lines: ProductLine[];
  suggestions: string[];
}) {
  const badges = lineBadges(lines);
  const accountById = new Map(client.publisher_accounts.map((a) => [a.id, a]));
  const keystoreById = new Map(client.keystores.map((k) => [k.id, k]));
  const everLive = everLiveProducts(client.releases.flatMap((r) => r.apps));

  // The latest submission of each app, to show where it stands right now.
  const latest = new Map<string, App>();
  for (const r of client.releases) {
    for (const a of r.apps) if (!latest.has(a.product_id)) latest.set(a.product_id, a);
  }
  const submissions = new Map<string, number>();
  for (const r of client.releases) {
    for (const a of r.apps) {
      submissions.set(a.product_id, (submissions.get(a.product_id) ?? 0) + 1);
    }
  }

  const products = [...client.products].sort((a, b) => Number(a.archived) - Number(b.archived));

  // One section per store, archived apps last within it.
  const productGroups = (["play_store", "app_store"] as const)
    .map((platform) => ({
      platform,
      accountName:
        client.publisher_accounts.find((a) => a.platform === platform)?.account_name ?? "",
      products: products.filter((p) => accountById.get(p.account_id)?.platform === platform),
    }))
    .filter((g) => g.products.length > 0);

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <h2 className="text-[14px] font-semibold">Apps</h2>
          <p className="text-[12px] text-muted-foreground">
            Set up once. Every new release submits all active apps; edits here apply to every release.
          </p>
        </div>
        <ProductDialog
          clientId={client.id}
          accounts={client.publisher_accounts}
          keystores={client.keystores}
          suggestions={suggestions}
          trigger={
            <>
              <PlusIcon className="size-4" /> Add app
            </>
          }
          className="btn btn-primary"
        />
      </div>

      {products.length === 0 ? (
        <p className="px-4 py-10 text-center text-[13px] text-muted-foreground">
          No apps yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="th">App</th>
                <th className="th">Keystore</th>
                <th className="th">Store link</th>
                <th className="th">Latest</th>
                <th className="th w-0" />
              </tr>
            </thead>
            {productGroups.map((group) => (
              <tbody key={group.platform}>
                <tr className="border-b bg-muted/60">
                  <td colSpan={5} className="px-3 py-1.5">
                    <div className="flex items-center gap-2 text-[12px]">
                      <StoreIcon platform={group.platform} size={14} />
                      <span className="font-semibold">{PLATFORMS[group.platform].label}</span>
                      {group.accountName && (
                        <span className="text-muted-foreground">{group.accountName}</span>
                      )}
                      <span className="ml-auto tabular-nums text-muted-foreground">
                        {group.products.filter((p) => !p.archived).length} active
                      </span>
                    </div>
                  </td>
                </tr>
                {group.products.map((p) => {
                  const keystore = p.keystore_id ? keystoreById.get(p.keystore_id) : undefined;
                  const last = latest.get(p.id);
                  const count = submissions.get(p.id) ?? 0;
                  return (
                    <tr
                      key={p.id}
                      className={`border-b last:border-0 ${p.archived ? "opacity-55" : "hover:bg-muted/40"}`}
                    >
                      <td className="td">
                        <div className="flex items-center gap-2.5">
                          <ProjectLogo badge={badges[p.project_name]} project={p.project_name} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1 font-medium">
                              {p.app_name || (
                                <span className="text-muted-foreground">Unnamed</span>
                              )}
                              {p.app_name && (
                                <CopyButton value={p.app_name} label="Copy app name" />
                              )}
                              {p.archived && <Tag>Archived</Tag>}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {p.project_name}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="td whitespace-nowrap">
                        {keystore ? (
                          keystore.name
                        ) : (
                          <span className="text-muted-foreground/60">None</span>
                        )}
                      </td>
                      <td className="td max-w-[220px]">
                        {p.store_url ? (
                          <span className="flex items-center gap-1">
                            <a
                              href={p.store_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex min-w-0 items-center gap-1 text-[12px] font-medium text-info hover:underline"
                            >
                              <span className="truncate">
                                {p.store_url.replace(/^https?:\/\//, "")}
                              </span>
                              <ExternalLinkIcon className="size-3 shrink-0" />
                            </a>
                            <CopyButton value={p.store_url} label="Copy store link" />
                          </span>
                        ) : (
                          <span className="text-muted-foreground/60">Not live yet</span>
                        )}
                        {p.store_checked_at && (
                          <div className="mt-0.5 text-[11px] text-muted-foreground">
                            {p.store_live
                              ? `Live on store${p.store_version ? ` · v${p.store_version}` : ""}`
                              : "Not on the store"}
                          </div>
                        )}
                      </td>
                      <td className="td whitespace-nowrap">
                        {last ? (
                          <StatusChip status={last.status} />
                        ) : (
                          <span className="text-muted-foreground/60">Never submitted</span>
                        )}
                      </td>
                      <td className="td">
                        <div className="flex items-center justify-end gap-0.5">
                          <ProductDialog
                            clientId={client.id}
                            accounts={client.publisher_accounts}
                            keystores={client.keystores}
                            suggestions={suggestions}
                            product={p}
                            trigger="Edit"
                            className="btn btn-ghost h-7 px-2"
                          />
                          {!p.archived && (
                            <>
                              <ListingDialog
                                product={p}
                                platform={group.platform}
                                trigger={
                                  <span className="inline-flex items-center gap-1.5">
                                    Listing
                                    {(group.platform === "app_store"
                                      ? publishChecksIos(publishDataIos(client, p))
                                      : publishChecks(publishData(client, p))
                                    ).some((c) => !c.ok) && (
                                      <span
                                        className="size-1.5 rounded-full bg-[var(--st-in-review)]"
                                        title="Some store details are missing"
                                      />
                                    )}
                                  </span>
                                }
                              />
                              {/* A first release creates the app; later ones update it. */}
                              <PublishPanel
                                client={client}
                                product={p}
                                platform={group.platform}
                                badge={badges[p.project_name]}
                                accountName={accountById.get(p.account_id)?.account_name ?? ""}
                                mode={isFirstPublish(p, everLive) ? "publish" : "update"}
                                version={
                                  expectedVersion(latest.get(p.id)?.build_version ?? null, null) ||
                                  undefined
                                }
                              />
                            </>
                          )}
                          <ArchiveToggle productId={p.id} archived={p.archived} />
                          {count === 0 && (
                            <DeleteButton
                              label="✕"
                              confirmText={`Delete ${p.app_name || p.project_name}? It has never been submitted.`}
                              action={async () => {
                                "use server";
                                return deleteProduct(p.id);
                              }}
                              className="btn btn-ghost size-7 px-0"
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        </div>
      )}
    </section>
  );
}

function ReleasesTab({
  client,
  roster,
  lines,
}: {
  client: ClientFull;
  roster: TeamMember[];
  lines: ProductLine[];
}) {
  const names = teamIndex(roster);

  if (client.releases.length === 0) {
    return (
      <EmptyState
        title="No releases yet"
        body="Each release you start shows up here with its title or date, owner and outcome."
        action={
          <NewRoundDialog
            clientId={client.id}
            apps={roundAppsFor(client, lines)}
            team={activeMembers(roster)}
          />
        }
      />
    );
  }

  return (
    <section className="card overflow-hidden">
      <ul className="divide-y">
        {client.releases.map((r, i) => {
          const state = releaseState(r.apps);
          const live = r.apps.filter((a) => a.status === "production").length;
          return (
            <li key={r.id}>
              <Link
                href={`/releases/${r.id}`}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-muted/40"
              >
                <span className={`size-2 shrink-0 rounded-full ${RELEASE_STATES[state].dot}`} />
                <span className="text-[14px] font-semibold">{releaseLabel(r)}</span>
                {i === 0 && <Tag>Current</Tag>}
                <span className="ml-auto flex items-center gap-4 text-[12px] text-muted-foreground">
                  <span>{(r.assigned_to && names.get(r.assigned_to)) || "Unassigned"}</span>
                  <span>
                    {live}/{r.apps.length} live
                  </span>
                  <span className="w-28 text-right">
                    {r.released_on
                      ? `Released ${formatDate(r.released_on)}`
                      : `Started ${formatDate(r.started_on)}`}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function CredentialsTab({ client }: { client: ClientFull }) {
  // Which apps sign with each keystore.
  const keystoreUsers = new Map<string, string[]>();
  for (const p of client.products) {
    if (!p.keystore_id || p.archived) continue;
    const users = keystoreUsers.get(p.keystore_id) ?? [];
    users.push(p.app_name || p.project_name);
    keystoreUsers.set(p.keystore_id, users);
  }
  const totalSubmissions = client.releases.reduce((n, r) => n + r.apps.length, 0);

  // Shared by every Play Store app; the publisher fills these into Play Console.
  const playDetails: [string, string | null][] = [
    ["Privacy policy", client.play_privacy_url],
    ["Delete account", client.play_delete_account_url],
    ["Contact email", client.play_contact_email],
    ["Listing email", client.play_listing_email],
    ["Phone", client.play_contact_phone],
    ["Website", client.play_website],
    ["Default language", client.play_default_language],
  ];
  const reviewContact = [client.review_contact_first_name, client.review_contact_last_name]
    .filter(Boolean)
    .join(" ");
  const iosDetails: [string, string | null][] = [
    ["Support URL", client.store_support_url],
    ["Marketing URL", client.store_marketing_url],
    ["Review contact", reviewContact || null],
    ["Review phone", client.review_contact_phone],
    ["Review email", client.review_contact_email],
  ];
  const detailRows = (rows: [string, string | null][]) =>
    rows.map(([label, value]) => (
      <div key={label} className="flex min-w-0 items-center gap-2">
        <dt className="w-28 shrink-0 text-[12px] text-muted-foreground">{label}</dt>
        <dd className="flex min-w-0 items-center gap-1">
          {value ? (
            <>
              <span className="truncate">{value}</span>
              <CopyButton value={value} label={`Copy ${label.toLowerCase()}`} />
            </>
          ) : (
            <span className="text-muted-foreground/60">Not set</span>
          )}
        </dd>
      </div>
    ));

  return (
    <div className="space-y-4">
      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2 className="text-[14px] font-semibold">Store details</h2>
            <p className="text-[12px] text-muted-foreground">
              Shared by every app of this client — the publisher fills these into each store.
              {client.intake_submitted_at &&
                ` The client last updated them through their form on ${formatDate(client.intake_submitted_at)}.`}
            </p>
          </div>
          <ClientPlayDialog client={client} />
        </div>
        <div className="grid gap-x-8 md:grid-cols-2">
          <div className="px-4 py-3">
            <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold">
              <StoreIcon platform="play_store" size={13} /> Play Store
            </h3>
            <dl className="space-y-2 text-[13px]">{detailRows(playDetails)}</dl>
          </div>
          <div className="border-t px-4 py-3 md:border-t-0 md:border-l">
            <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold">
              <StoreIcon platform="app_store" size={13} /> App Store
            </h3>
            <dl className="space-y-2 text-[13px]">{detailRows(iosDetails)}</dl>
            <p className="mt-2 text-[11px] text-muted-foreground">
              The privacy policy URL is shared with Play.
            </p>
          </div>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2 className="text-[14px] font-semibold">Store accounts</h2>
            <p className="text-[12px] text-muted-foreground">
              The developer accounts this client publishes under.
            </p>
          </div>
          <AccountDialog clientId={client.id} trigger="+ Account" className="btn btn-secondary" />
        </div>
        {client.publisher_accounts.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">
            No store account yet.
          </p>
        ) : (
          <ul className="divide-y">
            {client.publisher_accounts.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="flex w-28 shrink-0 items-center gap-1.5 text-[13px] font-medium">
                  <StoreIcon platform={a.platform} size={14} />
                  {PLATFORMS[a.platform].label}
                </span>
                <span className="flex min-w-0 flex-1 items-center gap-1">
                  <span className="truncate text-[13px]">
                    {a.account_name || <span className="text-muted-foreground">unnamed</span>}
                  </span>
                  {a.account_name && (
                    <CopyButton value={a.account_name} label="Copy account name" />
                  )}
                </span>
                <AccountAccess account={a} />
                <Tag>{ACCOUNT_TYPES[a.account_type].label}</Tag>
                <AccountDialog
                  clientId={client.id}
                  account={a}
                  trigger="Edit"
                  className="btn btn-ghost h-7 px-2"
                />
                <DeleteButton
                  label="✕"
                  confirmText={`Delete the ${PLATFORMS[a.platform].label} account? Its apps and all their submissions are removed from every release.`}
                  action={async () => {
                    "use server";
                    return deleteAccount(a.id);
                  }}
                  className="btn btn-ghost size-7 px-0"
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2 className="text-[14px] font-semibold">Keystores</h2>
            <p className="text-[12px] text-muted-foreground">
              Signing keys for the Play Store apps. Link one to an app on the Apps tab.
            </p>
          </div>
          <KeystoreDialog clientId={client.id} trigger="+ Keystore" className="btn btn-secondary" />
        </div>
        {client.keystores.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">
            No keystore yet.
          </p>
        ) : (
          <ul className="divide-y">
            {client.keystores.map((k) => {
              const users = keystoreUsers.get(k.id) ?? [];
              return (
                <li key={k.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                  <span className="w-40 shrink-0 truncate text-[13px] font-medium">{k.name}</span>
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    {k.file_path ? (
                      <>
                        <span
                          className="truncate font-mono text-[12px] text-muted-foreground"
                          title={k.file_name ?? ""}
                        >
                          {k.file_name}
                        </span>
                        <KeystoreDownloadButton keystoreId={k.id} />
                      </>
                    ) : (
                      <span className="text-[12px] text-muted-foreground/60">No file</span>
                    )}
                    {k.details && <CopyButton value={k.details} label="Copy JKS details" />}
                  </span>
                  <span
                    className="max-w-[260px] truncate text-[12px] text-muted-foreground"
                    title={users.join(", ")}
                  >
                    {users.length ? `Used by ${users.join(", ")}` : "Not linked to any app"}
                  </span>
                  <KeystoreDialog
                    clientId={client.id}
                    keystore={k}
                    trigger="Edit"
                    className="btn btn-ghost h-7 px-2"
                  />
                  <DeleteButton
                    label="✕"
                    confirmText={`Delete the keystore "${k.name}" and its file? Apps using it will be unlinked.`}
                    action={async () => {
                      "use server";
                      return deleteKeystore(k.id);
                    }}
                    className="btn btn-ghost size-7 px-0"
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3">
        <p className="text-[12px] text-muted-foreground">
          Deleting the client removes its store accounts, keystores, {client.products.length}{" "}
          apps, {client.releases.length} releases and {totalSubmissions} submissions.
        </p>
        <DeleteButton
          label="Delete client"
          confirmText={`Delete ${client.name} and everything under it? This cannot be undone.`}
          action={async () => {
            "use server";
            return deleteClient(client.id);
          }}
          className="btn btn-secondary text-destructive hover:bg-destructive/10"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- helpers --

/** How the team gets into this store account, as the client told us. */
function AccountAccess({ account: a }: { account: ClientFull["publisher_accounts"][number] }) {
  if (!a.access_method) {
    return <span className="hidden text-[12px] text-muted-foreground/70 sm:inline">No access yet</span>;
  }
  if (a.access_method === "invite") {
    return (
      <span className="hidden min-w-0 items-center gap-1 text-[12px] text-muted-foreground sm:flex">
        Invited
        {a.access_email && <span className="truncate font-medium text-foreground">{a.access_email}</span>}
      </span>
    );
  }
  return (
    <span className="hidden min-w-0 items-center gap-1 text-[12px] text-muted-foreground sm:flex">
      Login
      {a.access_email && (
        <>
          <span className="truncate font-medium text-foreground">{a.access_email}</span>
          <CopyButton value={a.access_email} label="Copy login" />
        </>
      )}
      {a.login_password && <CopyButton value={a.login_password} label="Copy password" />}
    </span>
  );
}

function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action: React.ReactNode;
}) {
  return (
    <div className="card px-6 py-14 text-center">
      <p className="text-[15px] font-semibold">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-[13px] text-muted-foreground">{body}</p>
      <div className="mt-5 flex justify-center">{action}</div>
    </div>
  );
}

/** "Anelissa" -> "AN", "Green Valley Foods" -> "GV". */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
