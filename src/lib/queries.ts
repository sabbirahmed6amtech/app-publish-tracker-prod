import { cache } from "react";
import { placeholders, row, rows } from "@/lib/db";
import { logoUrl } from "@/lib/uploads";
import { STATUS_ORDER } from "@/lib/constants";
import { everLiveProducts } from "@/lib/publish";
import type {
  App,
  AppEvent,
  AppRow,
  AppStatus,
  Client,
  ClientFull,
  Intake,
  IntakeApp,
  Keystore,
  LineBadge,
  Product,
  ProductLine,
  Platform,
  PublisherAccount,
  Release,
  ReleaseWithApps,
  TeamMember,
} from "@/lib/types";

/**
 * Clients with everything under them: store accounts, keystores, apps
 * (products), and releases with their submissions. Five queries for any
 * number of clients, assembled here.
 */
async function withTree(clients: Client[]): Promise<ClientFull[]> {
  if (clients.length === 0) return [];
  const ids = clients.map((c) => c.id);
  const inIds = `(${placeholders(ids.length)})`;
  const [accounts, keystores, products, releases] = await Promise.all([
    rows<PublisherAccount>(`SELECT * FROM publisher_accounts WHERE client_id IN ${inIds}`, ids),
    rows<Keystore>(`SELECT * FROM keystores WHERE client_id IN ${inIds}`, ids),
    rows<Product>(`SELECT * FROM products WHERE client_id IN ${inIds}`, ids),
    rows<Release>(`SELECT * FROM releases WHERE client_id IN ${inIds}`, ids),
  ]);
  const releaseIds = releases.map((r) => r.id);
  const apps = releaseIds.length
    ? await rows<App>(`SELECT * FROM apps WHERE release_id IN (${placeholders(releaseIds.length)})`, releaseIds)
    : [];

  const group = <T,>(list: T[], key: (item: T) => string) => {
    const map = new Map<string, T[]>();
    for (const item of list) {
      const k = key(item);
      map.set(k, [...(map.get(k) ?? []), item]);
    }
    return map;
  };
  const appsByRelease = group(apps, (a) => a.release_id);
  const accountsBy = group(accounts, (a) => a.client_id);
  const keystoresBy = group(keystores, (k) => k.client_id);
  const productsBy = group(products, (p) => p.client_id);
  const releasesBy = group(releases, (r) => r.client_id);

  return clients.map((c) =>
    sortTree({
      ...c,
      publisher_accounts: accountsBy.get(c.id) ?? [],
      keystores: keystoresBy.get(c.id) ?? [],
      products: productsBy.get(c.id) ?? [],
      releases: (releasesBy.get(c.id) ?? []).map((r) => ({ ...r, apps: appsByRelease.get(r.id) ?? [] })),
    } as ClientFull),
  );
}

function sortTree(c: ClientFull): ClientFull {
  c.publisher_accounts = (c.publisher_accounts ?? []).sort((a, b) =>
    a.platform.localeCompare(b.platform),
  );
  c.keystores = (c.keystores ?? []).sort((a, b) => a.name.localeCompare(b.name));
  c.products = sortProducts(c.products ?? []);
  // Newest release first — that is the one being worked on.
  c.releases = (c.releases ?? []).sort(
    (a, b) => b.started_on.localeCompare(a.started_on) || b.version.localeCompare(a.version),
  );
  for (const r of c.releases) {
    r.apps = (r.apps ?? []).sort(
      (a, b) => a.sort_order - b.sort_order || a.project_name.localeCompare(b.project_name),
    );
  }
  return c;
}

export function sortProducts(products: Product[]): Product[] {
  return products.sort(
    (a, b) => a.sort_order - b.sort_order || a.project_name.localeCompare(b.project_name),
  );
}

/**
 * Deduplicated per request: the layout and the page both need this, and
 * `cache` collapses them into a single round trip.
 */
export const getTeam = cache(async function getTeam(): Promise<TeamMember[]> {
  return rows<TeamMember>(
    `SELECT m.*, u.email AS login_email
       FROM team_members m LEFT JOIN users u ON u.id = m.user_id
      ORDER BY m.name`,
  );
});

/** Only active members belong in the assignment pickers. */
export function activeMembers(team: TeamMember[]): TeamMember[] {
  return team.filter((m) => m.active);
}

/** id -> display name, for resolving assignments without a join per row. */
export function teamIndex(team: TeamMember[]): Map<string, string> {
  return new Map(team.map((m) => [m.id, m.name]));
}

export const getClients = cache(async function getClients(): Promise<ClientFull[]> {
  const clients = await rows<Client>("SELECT * FROM clients WHERE archived = FALSE ORDER BY name");
  return withTree(clients);
});

export const getClient = cache(async function getClient(id: string): Promise<ClientFull | null> {
  const client = await row<Client>("SELECT * FROM clients WHERE id = ?", [id]);
  if (!client) return null;
  const [full] = await withTree([client]);
  return full;
});

export type ReleaseDetail = {
  release: ReleaseWithApps;
  client: Client;
  accounts: PublisherAccount[];
  keystores: Keystore[];
  products: Product[];
  siblings: Release[];
  /** Products that have been live in any of this client's releases. */
  everLive: string[];
};

export const getRelease = cache(async function getRelease(
  releaseId: string,
): Promise<ReleaseDetail | null> {
  const release = await row<Release>("SELECT * FROM releases WHERE id = ?", [releaseId]);
  if (!release) return null;
  const client = await row<Client>("SELECT * FROM clients WHERE id = ?", [release.client_id]);
  if (!client) return null;

  const [apps, accounts, keystores, products, siblings, statuses] = await Promise.all([
    rows<App>("SELECT * FROM apps WHERE release_id = ?", [release.id]),
    rows<PublisherAccount>("SELECT * FROM publisher_accounts WHERE client_id = ?", [client.id]),
    rows<Keystore>("SELECT * FROM keystores WHERE client_id = ?", [client.id]),
    rows<Product>("SELECT * FROM products WHERE client_id = ?", [client.id]),
    rows<Release>("SELECT * FROM releases WHERE client_id = ?", [client.id]),
    rows<{ product_id: string; status: string }>(
      "SELECT a.product_id, a.status FROM apps a JOIN releases r ON r.id = a.release_id WHERE r.client_id = ?",
      [client.id],
    ),
  ]);

  return {
    release: {
      ...release,
      apps: apps.sort(
        (a, b) => a.sort_order - b.sort_order || a.project_name.localeCompare(b.project_name),
      ),
    },
    client,
    accounts: accounts.sort((a, b) => a.platform.localeCompare(b.platform)),
    keystores: keystores.sort((a, b) => a.name.localeCompare(b.name)),
    products: sortProducts(products),
    everLive: [...everLiveProducts(statuses)],
    siblings: siblings.sort(
      (a, b) => b.started_on.localeCompare(a.started_on) || b.version.localeCompare(a.version),
    ),
  };
});

/** Everything flattened to one row per app — the sheet view. */
export function flatten(clients: ClientFull[], names?: Map<string, string>): AppRow[] {
  const nameOf = (id: string | null) => (id ? (names?.get(id) ?? null) : null);
  const rows: AppRow[] = [];

  for (const c of clients) {
    const accounts = new Map(c.publisher_accounts.map((a) => [a.id, a]));

    for (const release of c.releases) {
      for (const app of release.apps) {
        const account = accounts.get(app.account_id);
        if (!account) continue;

        rows.push({
          ...app,
          client_id: c.id,
          ticket: c.ticket,
          client_name: c.name,
          release_version: release.version,
          release_title: release.title,
          release_note: release.note,
          assignee_name: nameOf(app.assigned_to),
          release_assignee_name: nameOf(release.assigned_to),
          platform: account.platform,
          account_name: account.account_name,
          account_type: account.account_type,
        });
      }
    }
  }
  return rows;
}

export type Stats = {
  totalApps: number;
  totalClients: number;
  totalReleases: number;
  openReleases: number;
  byStatus: { status: AppStatus; count: number }[];
  byPlatform: { platform: Platform; count: number }[];
  needsAttention: AppRow[];
  waiting: AppRow[];
};

export function buildStats(clients: ClientFull[], rows: AppRow[]): Stats {
  const releases = clients.flatMap((c) => c.releases);

  const olderFirst = (a: AppRow, b: AppRow) =>
    new Date(a.status_changed_at).getTime() - new Date(b.status_changed_at).getTime();

  return {
    totalApps: rows.length,
    totalClients: clients.length,
    totalReleases: releases.length,
    openReleases: releases.filter((r) => !r.released_on).length,
    byStatus: STATUS_ORDER.map((status) => ({
      status,
      count: rows.filter((r) => r.status === status).length,
    })),
    byPlatform: (["play_store", "app_store"] as Platform[]).map((platform) => ({
      platform,
      count: rows.filter((r) => r.platform === platform).length,
    })),
    needsAttention: rows
      .filter((r) => r.status === "rejected" || r.status === "on_hold")
      .sort(olderFirst),
    waiting: rows
      .filter((r) => r.status === "in_review" || r.status === "closed_testing")
      .sort(olderFirst),
  };
}

/** One page of activity for some apps, newest first, with the total count. */
export async function getActivityPage(
  appIds: string[],
  page: number,
  pageSize: number,
): Promise<{ events: AppEvent[]; total: number }> {
  if (appIds.length === 0) return { events: [], total: 0 };
  const inIds = `(${placeholders(appIds.length)})`;
  const [events, count] = await Promise.all([
    rows<AppEvent>(
      `SELECT * FROM app_events WHERE app_id IN ${inIds} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...appIds, pageSize, (page - 1) * pageSize],
    ),
    row<{ n: number }>(`SELECT COUNT(*) AS n FROM app_events WHERE app_id IN ${inIds}`, appIds),
  ]);
  return { events, total: Number(count?.n ?? 0) };
}

export async function getRecentActivity(limit = 15) {
  const list = await rows<AppEvent & { a_app_name: string | null; a_project_name: string | null; a_release_id: string | null }>(
    `SELECT e.*, a.app_name AS a_app_name, a.project_name AS a_project_name, a.release_id AS a_release_id
       FROM app_events e LEFT JOIN apps a ON a.id = e.app_id
      ORDER BY e.created_at DESC LIMIT ?`,
    [limit],
  );
  return list.map(({ a_app_name, a_project_name, a_release_id, ...e }) => ({
    ...e,
    apps:
      a_release_id === null
        ? null
        : { app_name: a_app_name ?? "", project_name: a_project_name ?? "", release_id: a_release_id },
  })) as (AppEvent & {
    apps: { app_name: string; project_name: string; release_id: string } | null;
  })[];
}

/** The signed-in user's team member id — what "Me" means in filters. */
export { getCurrentMemberId } from "@/lib/auth";

/** Product lines with their projects, in display order. */
export const getProductLines = cache(async function getProductLines(): Promise<ProductLine[]> {
  const [lines, projects] = await Promise.all([
    rows<{ id: string; name: string; logo_path: string | null; sort_order: number }>(
      "SELECT id, name, logo_path, sort_order FROM product_lines ORDER BY sort_order, name",
    ),
    rows<{ line_id: string; project_name: string }>(
      "SELECT line_id, project_name FROM product_line_projects ORDER BY sort_order",
    ),
  ]);
  return lines.map((l) => ({
    id: l.id,
    name: l.name,
    logo_path: l.logo_path,
    logo_url: logoUrl(l.logo_path),
    sort_order: l.sort_order,
    projects: projects.filter((p) => p.line_id === l.id).map((p) => p.project_name),
  }));
});

export type LineProjectDescription = {
  project_name: string;
  short_description: string | null;
  long_description: string | null;
};

/** Each line's projects with their generic store descriptions, for Settings. */
export const lineDescriptions = cache(async function lineDescriptions(): Promise<
  Record<string, LineProjectDescription[]>
> {
  const list = await rows<{ line_id: string } & LineProjectDescription>(
    `SELECT line_id, project_name, short_description, long_description
       FROM product_line_projects ORDER BY sort_order, project_name`,
  );
  const out: Record<string, LineProjectDescription[]> = {};
  for (const { line_id, ...rest } of list) (out[line_id] ??= []).push(rest);
  return out;
});

/** project name -> its line's name and logo, for badges anywhere an app shows. */
export function lineBadges(lines: ProductLine[]): Record<string, LineBadge> {
  const out: Record<string, LineBadge> = {};
  for (const l of lines) {
    for (const p of l.projects) out[p] = { line: l.name, logo: l.logo_url };
  }
  return out;
}

/** Every project worth suggesting: the product lines' plus any already in use. */
export function projectSuggestions(lines: ProductLine[], clients: ClientFull[]): string[] {
  const names = new Set(lines.flatMap((l) => l.projects));
  for (const c of clients) for (const p of c.products) names.add(p.project_name);
  return [...names].sort((a, b) => a.localeCompare(b));
}

// ----------------------------------------------------------- public tracker

export type TrackerMatch = { ticket: string; name: string; apps: string | null };

export type TrackerApp = {
  app_name: string;
  project: string;
  platform: Platform;
  status: AppStatus;
  build: string | null;
  status_changed_at: string;
  /** Display name only. */
  assignee: string | null;
  store_url: string | null;
  line: string | null;
  /** Public logo URL, resolved from the line's stored path. */
  logo: string | null;
};

export type TrackerRelease = {
  version: string;
  title: string | null;
  started_on: string;
  released_on: string | null;
  /** Who is running this release — display name only. */
  assignee: string | null;
  apps: TrackerApp[];
};

export type TrackerClient = {
  ticket: string;
  name: string;
  releases: TrackerRelease[];
  activity: {
    app: string;
    platform: Platform;
    version: string;
    from: AppStatus | null;
    to: AppStatus | null;
    at: string;
  }[];
};

/** Public search: clients by name, ticket or store listing name (2+ characters, 10 at most). */
export async function trackerSearch(q: string): Promise<TrackerMatch[]> {
  const raw = q.trim();
  if (raw.length < 2) return [];
  const pattern = `%${raw.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return rows<TrackerMatch>(
    `SELECT c.ticket, c.name,
            (SELECT GROUP_CONCAT(DISTINCT NULLIF(p.app_name, '') ORDER BY p.app_name SEPARATOR ', ')
               FROM products p WHERE p.client_id = c.id AND p.archived = FALSE) AS apps
       FROM clients c
      WHERE c.archived = FALSE
        AND (c.name LIKE ? OR c.ticket LIKE ?
             OR EXISTS (SELECT 1 FROM products p WHERE p.client_id = c.id AND p.app_name LIKE ?))
      ORDER BY (c.ticket = ?) DESC, (c.name LIKE ?) DESC, c.name
      LIMIT 10`,
    [pattern, pattern, pattern, raw, `${raw}%`],
  );
}

/**
 * Public status of one client, or null if there's no such client. Only what
 * the tracker shows: names, versions, statuses, dates, assignees' names, and
 * the store link once live — never credentials, notes or account details.
 */
export async function trackerClient(ticket: string): Promise<TrackerClient | null> {
  const client = await row<{ id: string; ticket: string; name: string }>(
    "SELECT id, ticket, name FROM clients WHERE ticket = ? AND archived = FALSE",
    [ticket.trim()],
  );
  if (!client) return null;

  const releases = await rows<{
    id: string;
    version: string;
    title: string | null;
    started_on: string;
    released_on: string | null;
    assignee: string | null;
  }>(
    `SELECT r.id, r.version, r.title, r.started_on, r.released_on, m.name AS assignee
       FROM releases r LEFT JOIN team_members m ON m.id = r.assigned_to
      WHERE r.client_id = ?
      ORDER BY r.started_on DESC, r.version DESC
      LIMIT 12`,
    [client.id],
  );

  const ids = releases.map((r) => r.id);
  const apps = ids.length
    ? await rows<TrackerApp & { release_id: string; logo_path: string | null }>(
        `SELECT a.release_id, a.app_name, a.project_name AS project, pa.platform, a.status,
                a.build_version AS build, a.status_changed_at, m.name AS assignee,
                CASE WHEN a.status = 'production' THEN a.store_url END AS store_url,
                pl.name AS line, pl.logo_path
           FROM apps a
           JOIN publisher_accounts pa ON pa.id = a.account_id
           LEFT JOIN product_line_projects plp ON plp.project_name = a.project_name
           LEFT JOIN product_lines pl ON pl.id = plp.line_id
           LEFT JOIN team_members m ON m.id = a.assigned_to
          WHERE a.release_id IN (${placeholders(ids.length)})
          ORDER BY pa.platform, a.sort_order`,
        ids,
      )
    : [];

  const activity = await rows<TrackerClient["activity"][number]>(
    `SELECT COALESCE(NULLIF(a.app_name, ''), a.project_name) AS app, pa.platform, r.version,
            e.from_status AS \`from\`, e.to_status AS \`to\`, e.created_at AS at
       FROM app_events e
       JOIN apps a ON a.id = e.app_id
       JOIN releases r ON r.id = a.release_id
       JOIN publisher_accounts pa ON pa.id = a.account_id
      WHERE r.client_id = ? AND e.kind = 'status'
      ORDER BY e.created_at DESC
      LIMIT 15`,
    [client.id],
  );

  return {
    ticket: client.ticket,
    name: client.name,
    releases: releases.map(({ id, ...r }) => ({
      ...r,
      apps: apps
        .filter((a) => a.release_id === id)
        .map(({ release_id: _r, logo_path, ...a }) => ({ ...a, logo: logoUrl(logo_path) })),
    })),
    activity,
  };
}

/**
 * The client intake form behind a private link, or null if the link isn't
 * active. Only what the form shows: the client's store details, its store
 * accounts and its active apps' listing fields — never a saved password (only
 * whether one is saved), keystores, notes or team members.
 */
export async function intakeForm(token: string): Promise<Intake | null> {
  if (!token || token.length < 24) return null;
  const client = await row<{ id: string; name: string; ticket: string; submitted_at: string | null } & Intake["client"]>(
    `SELECT id, name, ticket, intake_submitted_at AS submitted_at,
            play_privacy_url, play_delete_account_url, play_contact_email, play_listing_email,
            play_contact_phone, play_website, play_default_language, store_support_url,
            store_marketing_url, review_contact_first_name, review_contact_last_name,
            review_contact_phone, review_contact_email
       FROM clients WHERE intake_token = ? AND archived = FALSE`,
    [token],
  );
  if (!client) return null;

  const [accounts, apps] = await Promise.all([
    rows<Intake["accounts"][number]>(
      `SELECT id, platform, account_name, account_type, access_method, access_email,
              (COALESCE(login_password, '') <> '') AS has_login_password
         FROM publisher_accounts WHERE client_id = ? ORDER BY platform DESC`,
      [client.id],
    ),
    rows<Omit<IntakeApp, "logo"> & { logo_path: string | null }>(
      `SELECT p.id, p.project_name, pa.platform, p.app_name, p.package_name, p.play_category,
              p.short_description, p.long_description, p.demo_instructions, p.demo_login,
              (COALESCE(p.demo_password, '') <> '') AS has_demo_password, p.demo_details,
              p.ios_subtitle, p.ios_keywords, p.ios_promo_text, p.ios_primary_category,
              p.ios_secondary_category, p.ios_copyright, p.publishing_countries,
              p.feature_graphic_url, p.screenshots_url, p.icon_url, p.client_note,
              pl.name AS line, pl.logo_path,
              plp.short_description AS std_short, plp.long_description AS std_long
         FROM products p
         JOIN publisher_accounts pa ON pa.id = p.account_id
         LEFT JOIN product_line_projects plp ON plp.project_name = p.project_name
         LEFT JOIN product_lines pl ON pl.id = plp.line_id
        WHERE p.client_id = ? AND p.archived = FALSE
        ORDER BY pa.platform DESC, p.sort_order, p.project_name`,
      [client.id],
    ),
  ]);

  const { id: _id, name, ticket, submitted_at, ...fields } = client;
  return {
    name,
    ticket,
    submitted_at,
    client: fields,
    // MySQL hands back 0/1 for these computed flags.
    accounts: accounts.map((a) => ({ ...a, has_login_password: Boolean(a.has_login_password) })),
    apps: apps.map(({ logo_path, ...a }) => ({
      ...a,
      has_demo_password: Boolean(a.has_demo_password),
      logo: logoUrl(logo_path),
    })),
  };
}
