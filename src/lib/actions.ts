"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getCurrentMemberId, requireUser } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/session";
import {
  type Conn,
  errorMessage,
  exec,
  ident,
  insert,
  insertMany,
  isDuplicate,
  placeholders,
  pool,
  row,
  rows,
  setImporting,
  transaction,
  updateById,
} from "@/lib/db";
import { removeUpload, safeFileName, saveUpload } from "@/lib/uploads";
import { runStoreWatch } from "@/lib/storeWatchRun";
import { prefillFromWebsite, type Prefill } from "@/lib/intakePrefill";
import { APP_STORE_LIMITS, PLAY_LIMITS, bumpBuild } from "@/lib/constants";
import type { AccountType, AppStatus, Platform } from "@/lib/types";
import {
  check,
  isEmail,
  isEmailOrPhone,
  isName,
  isPhone,
  isUrl,
  max,
  type Rule,
} from "@/lib/validate";

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

function nullable(fd: FormData, key: string): string | null {
  const v = str(fd, key);
  return v === "" ? null : v;
}

function refresh() {
  revalidatePath("/", "layout");
}

const fail = (error: unknown, duplicate?: string): ActionResult => ({
  ok: false,
  error: duplicate && isDuplicate(error) ? duplicate : errorMessage(error),
});

const today = () => new Date().toISOString().slice(0, 10);

// ------------------------------------------------------------------ clients

export async function saveClient(fd: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(fd, "id");
  const ticket = str(fd, "ticket");
  const name = str(fd, "name");

  if (!ticket) return { ok: false, error: "Ticket number is required." };
  if (!name) return { ok: false, error: "Client name is required." };

  const payload = { ticket, name, note: nullable(fd, "note") };
  try {
    const savedId = id ? (await updateById("clients", id, payload), id) : await insert("clients", payload);
    refresh();
    return { ok: true, id: savedId };
  } catch (e) {
    return fail(e, `Ticket ${ticket} already exists.`);
  }
}

export async function deleteClient(id: string): Promise<ActionResult> {
  await requireUser();
  // Keystore rows cascade with the client; their files have to go by hand.
  const keystores = await rows<{ file_path: string | null }>(
    "SELECT file_path FROM keystores WHERE client_id = ?",
    [id],
  );
  try {
    await exec("DELETE FROM clients WHERE id = ?", [id]);
  } catch (e) {
    return fail(e);
  }
  for (const k of keystores) await removeUpload("jks", k.file_path);
  refresh();
  redirect("/clients");
}

export type SetupApp = { project_name: string; app_name: string; stores: Platform[] };

/**
 * Everything a new client needs, from the setup wizard, in one go: the client,
 * its store accounts, its apps, an optional keystore, and the first release.
 * If any step fails nothing is kept.
 */
export async function createClientSetup(fd: FormData): Promise<ActionResult> {
  await requireUser();
  const ticket = str(fd, "ticket");
  const name = str(fd, "name");
  if (!ticket) return { ok: false, error: "Ticket number is required." };
  if (!name) return { ok: false, error: "Client name is required." };

  const stores = (["play_store", "app_store"] as Platform[]).filter(
    (p) => str(fd, `${p}_enabled`) === "1",
  );
  if (stores.length === 0) return { ok: false, error: "Pick at least one store." };

  let apps: SetupApp[] = [];
  try {
    apps = JSON.parse(str(fd, "apps") || "[]");
  } catch {
    return { ok: false, error: "The app list couldn't be read." };
  }
  apps = apps
    .map((a) => ({ ...a, project_name: a.project_name.trim(), app_name: a.app_name.trim() }))
    .filter((a) => a.project_name && a.stores.some((p) => stores.includes(p)));

  const file = fd.get("keystore_file");
  const upload = file instanceof File && file.size > 0 ? file : null;
  const details = nullable(fd, "keystore_details");

  let clientId: string;
  let savedFile: string | null = null;
  let productCount = 0;
  try {
    clientId = await transaction(async (conn) => {
      const id = await insert("clients", { ticket, name, note: nullable(fd, "note") }, conn);

      // ---- store accounts
      const accountFor = new Map<Platform, string>();
      for (const platform of stores) {
        accountFor.set(
          platform,
          await insert(
            "publisher_accounts",
            {
              client_id: id,
              platform,
              account_name: str(fd, `${platform}_account_name`),
              account_type: (str(fd, `${platform}_account_type`) || "organization") as AccountType,
            },
            conn,
          ),
        );
      }

      // ---- keystore
      let keystoreId: string | null = null;
      if (upload || details) {
        keystoreId = await insert(
          "keystores",
          { client_id: id, name: str(fd, "keystore_name") || "Main keystore", details },
          conn,
        );
        if (upload) savedFile = await storeKeystoreFile(keystoreId, upload, conn);
      }

      // ---- apps, one per store each ships to
      const products = apps.flatMap((a) =>
        a.stores
          .filter((p) => accountFor.has(p))
          .map((p) => ({
            client_id: id,
            account_id: accountFor.get(p)!,
            project_name: a.project_name,
            app_name: a.app_name,
            keystore_id: p === "play_store" ? keystoreId : null,
          })),
      );
      await insertMany(
        "products",
        products.map((p, i) => ({ ...p, sort_order: i })),
        conn,
      );
      productCount = products.length;
      return id;
    });
  } catch (e) {
    await removeUpload("jks", savedFile);
    if (isDuplicate(e) && /ticket/i.test(errorMessage(e))) {
      return { ok: false, error: `Ticket ${ticket} already exists.` };
    }
    return fail(e, "That project already exists on this store for this client.");
  }

  // ---- first release
  if (str(fd, "start_release") === "1" && productCount) {
    const created = await startNewRelease(clientId);
    if (!created.ok) {
      await exec("DELETE FROM clients WHERE id = ?", [clientId]);
      await removeUpload("jks", savedFile);
      return created;
    }
  }

  refresh();
  return { ok: true, id: clientId };
}

// ----------------------------------------------------------------- accounts

export async function saveAccount(fd: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(fd, "id");
  const account_name = str(fd, "account_name");
  if (!account_name) return { ok: false, error: "Account name is required." };

  const payload = {
    client_id: str(fd, "client_id"),
    platform: str(fd, "platform") as Platform,
    account_name,
    account_type: str(fd, "account_type") as AccountType,
    note: nullable(fd, "note"),
  };
  try {
    if (id) await updateById("publisher_accounts", id, payload);
    else await insert("publisher_accounts", payload);
  } catch (e) {
    return fail(e, "This client already has an account on that platform.");
  }
  refresh();
  return { ok: true };
}

export async function deleteAccount(id: string): Promise<ActionResult> {
  await requireUser();
  try {
    await exec("DELETE FROM publisher_accounts WHERE id = ?", [id]);
  } catch (e) {
    return fail(e);
  }
  refresh();
  return { ok: true };
}

// ----------------------------------------------------------------- releases

export async function saveRelease(fd: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(fd, "id");
  const client_id = str(fd, "client_id");

  const cascade = fd.get("cascade_assignee") !== null;
  const payload = {
    client_id,
    title: nullable(fd, "title"),
    assigned_to: nullable(fd, "assigned_to"),
    note: nullable(fd, "note"),
    started_on: str(fd, "started_on") || today(),
  };

  let savedId: string;
  try {
    savedId = id ? (await updateById("releases", id, payload), id) : await insert("releases", payload);
    if (cascade && payload.assigned_to) {
      await exec("UPDATE apps SET assigned_to = ? WHERE release_id = ?", [payload.assigned_to, savedId]);
    }
  } catch (e) {
    return fail(e);
  }
  refresh();
  return { ok: true, id: savedId };
}

export async function deleteRelease(id: string): Promise<ActionResult> {
  await requireUser();
  const release = await row<{ client_id: string }>("SELECT client_id FROM releases WHERE id = ?", [id]);
  try {
    await exec("DELETE FROM releases WHERE id = ?", [id]);
  } catch (e) {
    return fail(e);
  }
  refresh();
  // The page being viewed no longer exists.
  if (release) redirect(`/clients/${release.client_id}?tab=releases`);
  return { ok: true };
}

/**
 * Submit products into a release as fresh "ongoing" submissions. The Flutter
 * version carries over from each product's most recent submission, and its
 * build number is bumped (1.0.6+9 -> 1.0.7+10). The database fills in each
 * submission's identity from its product.
 */
async function submitProducts(
  releaseId: string,
  productIds: string[],
  assignee: string | null,
  conn?: Conn,
): Promise<void> {
  if (productIds.length === 0) return;
  const on = conn ?? pool;
  const inIds = `(${placeholders(productIds.length)})`;

  const [existing, previous, products] = await Promise.all([
    rows<{ product_id: string }>("SELECT product_id FROM apps WHERE release_id = ?", [releaseId], on),
    rows<{ product_id: string; flutter_version: string | null; build_version: string | null }>(
      `SELECT product_id, flutter_version, build_version FROM apps
        WHERE product_id IN ${inIds} ORDER BY created_at DESC`,
      productIds,
      on,
    ),
    rows<{ id: string; sort_order: number }>(
      `SELECT id, sort_order FROM products WHERE id IN ${inIds}`,
      productIds,
      on,
    ),
  ]);

  const already = new Set(existing.map((a) => a.product_id));
  // Newest first, so the first value seen per product is the latest one.
  const flutter = new Map<string, string | null>();
  const build = new Map<string, string>();
  for (const p of previous) {
    if (!flutter.has(p.product_id)) flutter.set(p.product_id, p.flutter_version);
    if (!build.has(p.product_id) && p.build_version) build.set(p.product_id, p.build_version);
  }

  await insertMany(
    "apps",
    products
      .filter((p) => !already.has(p.id))
      .map((p) => ({
        release_id: releaseId,
        product_id: p.id,
        // Filled from the product by the database.
        account_id: "",
        project_name: "",
        sort_order: p.sort_order,
        status: "ongoing" as AppStatus,
        assigned_to: assignee,
        flutter_version: flutter.get(p.id) ?? null,
        build_version: bumpBuild(build.get(p.id)),
      })),
    on,
  );
}

export async function startNewRelease(clientId: string): Promise<ActionResult> {
  await requireUser();
  const [products, me] = await Promise.all([
    rows<{ id: string }>("SELECT id FROM products WHERE client_id = ? AND archived = FALSE", [clientId]),
    getCurrentMemberId(),
  ]);
  try {
    const id = await transaction(async (conn) => {
      const releaseId = await insert(
        "releases",
        { client_id: clientId, assigned_to: me, started_on: today() },
        conn,
      );
      await submitProducts(releaseId, products.map((p) => p.id), me, conn);
      return releaseId;
    });
    refresh();
    return { ok: true, id };
  } catch (e) {
    return fail(e);
  }
}

export async function createRound(fd: FormData): Promise<ActionResult> {
  await requireUser();
  const clientId = str(fd, "client_id");
  if (!clientId) return { ok: false, error: "Missing client." };

  const assignedTo = nullable(fd, "assigned_to") ?? (await getCurrentMemberId());
  const productIds = fd.getAll("products").map(String).filter(Boolean);
  if (productIds.length === 0) return { ok: false, error: "Pick at least one app for this round." };

  const owned = await rows<{ id: string }>(
    `SELECT id FROM products WHERE client_id = ? AND archived = FALSE AND id IN (${placeholders(productIds.length)})`,
    [clientId, ...productIds],
  );
  const ids = owned.map((p) => p.id);
  if (ids.length === 0) return { ok: false, error: "Those apps don't belong to this client." };

  try {
    const id = await transaction(async (conn) => {
      const releaseId = await insert(
        "releases",
        {
          client_id: clientId,
          title: nullable(fd, "title"),
          assigned_to: assignedTo,
          started_on: str(fd, "started_on") || today(),
        },
        conn,
      );
      await submitProducts(releaseId, ids, assignedTo, conn);
      return releaseId;
    });
    refresh();
    return { ok: true, id };
  } catch (e) {
    return fail(e);
  }
}

/** Start a release with the same apps as a previous one. */
export async function copyAppsFromRelease(
  fromReleaseId: string,
  toReleaseId: string,
): Promise<ActionResult> {
  await requireUser();
  const [source, target] = await Promise.all([
    rows<{ product_id: string }>("SELECT product_id FROM apps WHERE release_id = ?", [fromReleaseId]),
    // The copies belong to whoever is running the new release.
    row<{ assigned_to: string | null }>("SELECT assigned_to FROM releases WHERE id = ?", [toReleaseId]),
  ]);
  try {
    await submitProducts(toReleaseId, source.map((a) => a.product_id), target?.assigned_to ?? null);
  } catch (e) {
    return fail(e);
  }
  refresh();
  return { ok: true };
}

/** Add some of the client's apps to an existing release. */
export async function addProductsToRelease(
  releaseId: string,
  productIds: string[],
): Promise<ActionResult> {
  await requireUser();
  const [release, me] = await Promise.all([
    row<{ assigned_to: string | null }>("SELECT assigned_to FROM releases WHERE id = ?", [releaseId]),
    getCurrentMemberId(),
  ]);
  try {
    await submitProducts(releaseId, productIds, release?.assigned_to ?? me);
  } catch (e) {
    return fail(e);
  }
  refresh();
  return { ok: true };
}

// ----------------------------------------------------------------- products

const DUPLICATE_PRODUCT = "That project already exists on this store for this client.";

/**
 * Create or edit one of a client's permanent apps. Creating takes one or more
 * store accounts and makes one app per store, since each store has its own
 * listing.
 */
export async function saveProduct(fd: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(fd, "id");
  const client_id = str(fd, "client_id");
  const project_name = str(fd, "project_name");
  if (!project_name) return { ok: false, error: "Project is required." };

  const fields = {
    project_name,
    app_name: str(fd, "app_name"),
    keystore_id: nullable(fd, "keystore_id"),
    store_url: nullable(fd, "store_url"),
    note: nullable(fd, "note"),
  };

  if (id) {
    try {
      await updateById("products", id, { ...fields, account_id: str(fd, "account_id") });
    } catch (e) {
      return fail(e, DUPLICATE_PRODUCT);
    }
    refresh();
    return { ok: true, id };
  }

  const accountIds = fd.getAll("account_ids").map(String).filter(Boolean);
  if (accountIds.length === 0) return { ok: false, error: "Pick at least one store." };

  const count = await row<{ n: number }>("SELECT COUNT(*) AS n FROM products WHERE client_id = ?", [client_id]);
  try {
    await insertMany(
      "products",
      accountIds.map((account_id, i) => ({
        ...fields,
        client_id,
        account_id,
        sort_order: Number(count?.n ?? 0) + i,
      })),
    );
  } catch (e) {
    return fail(e, DUPLICATE_PRODUCT);
  }
  refresh();
  return { ok: true };
}

/** The Play Console details shared by every app of a client. */
export async function saveClientPlayDetails(fd: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(fd, "id");
  // Only what this form sent: the Play and App Store forms show different
  // fields, and saving one must not wipe the other's.
  const fields = [
    "play_privacy_url",
    "play_delete_account_url",
    "play_contact_email",
    "play_listing_email",
    "play_contact_phone",
    "play_website",
    "play_default_language",
    "store_support_url",
    "store_marketing_url",
    "review_contact_first_name",
    "review_contact_last_name",
    "review_contact_phone",
    "review_contact_email",
  ];
  const update = Object.fromEntries(
    fields.filter((f) => fd.has(f)).map((f) => [f, nullable(fd, f)]),
  );
  try {
    await updateById("clients", id, update);
  } catch (e) {
    return fail(e);
  }
  refresh();
  return { ok: true, id };
}

/** One app's Play Console listing and App Review login. */
export async function saveProductListing(fd: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(fd, "id");
  const tooLong = (field: string, limit: number, label: string) => {
    const v = nullable(fd, field);
    return v && v.length > limit ? `The ${label} is over ${limit} characters.` : null;
  };
  const problem =
    tooLong("short_description", PLAY_LIMITS.shortDescription, "short description") ||
    tooLong("long_description", PLAY_LIMITS.longDescription, "full description") ||
    tooLong("ios_subtitle", APP_STORE_LIMITS.subtitle, "subtitle") ||
    tooLong("ios_keywords", APP_STORE_LIMITS.keywords, "keywords list") ||
    tooLong("ios_promo_text", APP_STORE_LIMITS.promoText, "promotional text");
  if (problem) return { ok: false, error: problem };

  const packageName = nullable(fd, "package_name");
  if (packageName && !/^[a-zA-Z][\w-]*(\.[a-zA-Z][\w-]*)+$/.test(packageName)) {
    return {
      ok: false,
      error: "That doesn't look like a package name or bundle ID (e.g. com.client.app).",
    };
  }

  // Only what this form sent: the Play and App Store listings show different
  // fields, and saving one must not wipe the other's.
  const fields = [
    "package_name",
    "play_category",
    "short_description",
    "long_description",
    "demo_instructions",
    "demo_login",
    "demo_password",
    "demo_details",
    "ios_sku",
    "ios_subtitle",
    "ios_keywords",
    "ios_promo_text",
    "ios_primary_category",
    "ios_secondary_category",
    "ios_copyright",
    "icon_url",
    "screenshots_url",
    "feature_graphic_url",
  ];
  const update = Object.fromEntries(
    fields.filter((f) => fd.has(f)).map((f) => [f, nullable(fd, f)]),
  );
  try {
    await updateById("products", id, update);
  } catch (e) {
    return fail(e);
  }
  refresh();
  return { ok: true, id };
}

/** Archived apps stay in history but aren't submitted in new releases. */
export async function setProductArchived(id: string, archived: boolean): Promise<ActionResult> {
  await requireUser();
  try {
    await updateById("products", id, { archived });
  } catch (e) {
    return fail(e);
  }
  refresh();
  return { ok: true };
}

/** Only apps never submitted can be deleted; the rest are archived. */
export async function deleteProduct(id: string): Promise<ActionResult> {
  await requireUser();
  const used = await row<{ n: number }>("SELECT COUNT(*) AS n FROM apps WHERE product_id = ?", [id]);
  const count = Number(used?.n ?? 0);
  if (count) {
    return {
      ok: false,
      error: `This app has ${count} submission${count === 1 ? "" : "s"} in past releases. Archive it instead.`,
    };
  }
  try {
    await exec("DELETE FROM products WHERE id = ?", [id]);
  } catch (e) {
    return fail(e);
  }
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------- keystores

/** Store a keystore file on disk and point the keystore at it; returns the stored path. */
async function storeKeystoreFile(
  keystoreId: string,
  file: File,
  conn?: Conn,
): Promise<string> {
  const relative = `keystores/${keystoreId}/${Date.now()}-${safeFileName(file.name)}`;
  await saveUpload("jks", relative, file);
  await updateById("keystores", keystoreId, { file_path: relative, file_name: file.name }, conn ?? pool);
  return relative;
}

export async function saveKeystore(fd: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(fd, "id");
  const client_id = str(fd, "client_id");
  const name = str(fd, "name");
  if (!name) return { ok: false, error: "Give the keystore a name." };

  const file = fd.get("file");
  const upload = file instanceof File && file.size > 0 ? file : null;
  const removeFile = str(fd, "file_remove") === "1";

  const payload = {
    client_id,
    name,
    details: nullable(fd, "details"),
    note: nullable(fd, "note"),
  };

  const previousPath =
    id && (upload || removeFile)
      ? ((await row<{ file_path: string | null }>("SELECT file_path FROM keystores WHERE id = ?", [id]))
          ?.file_path ?? null)
      : null;

  let savedId: string;
  try {
    savedId = id ? (await updateById("keystores", id, payload), id) : await insert("keystores", payload);
  } catch (e) {
    return fail(e);
  }

  if (upload) {
    try {
      await storeKeystoreFile(savedId, upload);
    } catch (e) {
      refresh();
      return { ok: false, error: `Keystore saved, but the file upload failed: ${errorMessage(e)}` };
    }
    await removeUpload("jks", previousPath);
  } else if (removeFile && previousPath) {
    await updateById("keystores", savedId, { file_path: null, file_name: null });
    await removeUpload("jks", previousPath);
  }

  refresh();
  return { ok: true, id: savedId };
}

/** Apps that used it are unlinked, not deleted. */
export async function deleteKeystore(id: string): Promise<ActionResult> {
  await requireUser();
  const keystore = await row<{ file_path: string | null }>("SELECT file_path FROM keystores WHERE id = ?", [id]);
  try {
    await exec("DELETE FROM keystores WHERE id = ?", [id]);
  } catch (e) {
    return fail(e);
  }
  await removeUpload("jks", keystore?.file_path);
  refresh();
  return { ok: true };
}

/** Where the browser downloads the keystore file (signed-in team members only). */
export async function getKeystoreDownloadUrl(
  keystoreId: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  await requireUser();
  const keystore = await row<{ file_path: string | null }>(
    "SELECT file_path FROM keystores WHERE id = ?",
    [keystoreId],
  );
  if (!keystore?.file_path) return { ok: false, error: "This keystore has no file." };
  return { ok: true, url: `/api/keystores/${encodeURIComponent(keystoreId)}/download` };
}

// --------------------------------------------------------------------- apps

/** Edit one submission — the per-release facts. Identity lives on the product. */
export async function saveApp(fd: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(fd, "id");
  if (!id) return { ok: false, error: "Add apps to a release from the client's app list." };
  try {
    await updateById("apps", id, {
      status: str(fd, "status") as AppStatus,
      assigned_to: nullable(fd, "assigned_to"),
      build_version: nullable(fd, "build_version"),
      flutter_version: nullable(fd, "flutter_version"),
      note: nullable(fd, "note"),
    });
  } catch (e) {
    return fail(e);
  }
  refresh();
  return { ok: true };
}

/** The fields that can be edited straight from a table cell. */
const INLINE_FIELDS = ["build_version", "flutter_version", "assigned_to", "note"] as const;
export type InlineField = (typeof INLINE_FIELDS)[number];

export async function updateAppField(
  id: string,
  field: InlineField,
  value: string | null,
): Promise<ActionResult> {
  await requireUser();
  if (!INLINE_FIELDS.includes(field)) return { ok: false, error: "That field can't be edited here." };
  try {
    await updateById("apps", id, { [field]: value?.trim() || null });
  } catch (e) {
    return fail(e);
  }
  refresh();
  return { ok: true };
}

export async function setAppStatus(id: string, status: AppStatus): Promise<ActionResult> {
  await requireUser();
  try {
    await updateById("apps", id, { status });
  } catch (e) {
    return fail(e);
  }
  refresh();
  return { ok: true };
}

export async function deleteApp(id: string): Promise<ActionResult> {
  await requireUser();
  try {
    await exec("DELETE FROM apps WHERE id = ?", [id]);
  } catch (e) {
    return fail(e);
  }
  refresh();
  return { ok: true };
}

// ------------------------------------------------------------------- import

export type ImportRow = {
  ticket: string;
  client_name: string;
  release_version: string;
  release_title: string;
  assigned_to: string;
  platform: Platform;
  account_name: string;
  account_type: AccountType;
  project_name: string;
  app_name: string;
  status: AppStatus;
  app_assigned_to: string;
  build_version: string;
  flutter_version: string;
  jks: string;
  note: string;
  store_url: string;
};

/**
 * Upsert parsed rows. Clients match on ticket, store accounts on
 * (client, platform), releases on (client, version) and apps on
 * (release, account, project) — so re-importing an edited export updates
 * rather than duplicates.
 */
export async function importRows(
  rows_: ImportRow[],
): Promise<{ ok: boolean; error?: string; created: number; updated: number }> {
  await requireUser();
  let created = 0;
  let updated = 0;

  // Cache lookups so a 40-row paste does not make 160 round trips.
  // Names in a paste are matched to the roster, and added if unseen.
  const memberIds = new Map<string, string | null>();
  async function memberId(name: string): Promise<string | null> {
    const key = name.trim().toLowerCase();
    if (!key) return null;
    if (memberIds.has(key)) return memberIds.get(key)!;
    const found = await row<{ id: string }>("SELECT id FROM team_members WHERE LOWER(name) = ?", [key]);
    const id = found?.id ?? (await insert("team_members", { name: name.trim() }));
    memberIds.set(key, id);
    return id;
  }

  /** The id of the row matching `where`, made from `values` if there isn't one. */
  async function findOrCreate(
    table: string,
    where: Record<string, string>,
    values: Record<string, unknown>,
  ): Promise<string> {
    const keys = Object.keys(where);
    const found = await row<{ id: string }>(
      `SELECT id FROM ${ident(table)} WHERE ${keys.map((k) => `lower(${ident(k)}::text) = lower(?::text)`).join(" AND ")}`,
      keys.map((k) => where[k]),
    );
    return found?.id ?? insert(table, { ...where, ...values });
  }

  const clientIds = new Map<string, string>();
  const accountIds = new Map<string, string>();
  const releaseIds = new Map<string, string>();
  const productIds = new Map<string, string>();
  const cached = async (map: Map<string, string>, key: string, make: () => Promise<string>) => {
    const hit = map.get(key);
    if (hit) return hit;
    const id = await make();
    map.set(key, id);
    return id;
  };

  try {
    for (const r of rows_) {
      const clientId = await cached(clientIds, r.ticket, () =>
        findOrCreate("clients", { ticket: r.ticket }, { name: r.client_name }),
      );
      const accountId = await cached(accountIds, `${clientId}:${r.platform}`, () =>
        findOrCreate(
          "publisher_accounts",
          { client_id: clientId, platform: r.platform },
          { account_name: r.account_name, account_type: r.account_type },
        ),
      );
      const releaseId = await cached(releaseIds, `${clientId}:${r.release_version}`, async () =>
        findOrCreate(
          "releases",
          { client_id: clientId, version: r.release_version },
          { title: r.release_title || null, assigned_to: await memberId(r.assigned_to), started_on: today() },
        ),
      );
      const productId = await cached(productIds, `${accountId}:${r.project_name}`, () =>
        findOrCreate(
          "products",
          { account_id: accountId, project_name: r.project_name },
          { client_id: clientId },
        ),
      );

      // The sheet's name and link describe the app itself.
      const identity: Record<string, string> = {};
      if (r.app_name) identity.app_name = r.app_name;
      if (r.store_url) identity.store_url = r.store_url;
      await updateById("products", productId, identity);

      // ---- submission
      const payload = {
        status: r.status,
        assigned_to: await memberId(r.app_assigned_to),
        build_version: r.build_version || null,
        flutter_version: r.flutter_version || null,
        jks: r.jks || null,
        note: r.note || null,
      };
      const existing = await row<{ id: string }>(
        "SELECT id FROM apps WHERE release_id = ? AND product_id = ?",
        [releaseId, productId],
      );
      if (existing) {
        await updateById("apps", existing.id, payload);
        updated++;
      } else {
        await insert("apps", {
          ...payload,
          release_id: releaseId,
          product_id: productId,
          // Filled from the product by the database.
          account_id: "",
          project_name: "",
        });
        created++;
      }
    }
  } catch (e) {
    return { ok: false, error: errorMessage(e), created, updated };
  }

  refresh();
  return { ok: true, created, updated };
}

// ------------------------------------------------------------ product lines

const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
const LOGO_MAX_BYTES = 1024 * 1024;

/**
 * Create or edit a product line: its name, logo and projects (one per line in
 * the form). The project list is replaced as a whole.
 */
export async function saveProductLine(fd: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(fd, "id");
  const name = str(fd, "name");
  if (!name) return { ok: false, error: "Give the product line a name." };

  const projects = [
    ...new Set(
      str(fd, "projects")
        .split("\n")
        .map((p) => p.trim())
        .filter(Boolean),
    ),
  ];

  const file = fd.get("logo");
  const logo = file instanceof File && file.size > 0 ? file : null;
  if (logo && !LOGO_TYPES.includes(logo.type)) {
    return { ok: false, error: "The logo must be a PNG, JPG, WebP or SVG image." };
  }
  if (logo && logo.size > LOGO_MAX_BYTES) {
    return { ok: false, error: "The logo must be 1 MB or smaller." };
  }
  const removeLogo = str(fd, "logo_remove") === "1";

  // A project belongs to one line; say which line already has it.
  if (projects.length) {
    const taken = await row<{ project_name: string; line: string }>(
      `SELECT plp.project_name, pl.name AS line
         FROM product_line_projects plp JOIN product_lines pl ON pl.id = plp.line_id
        WHERE plp.project_name IN (${placeholders(projects.length)}) AND plp.line_id <> ?
        LIMIT 1`,
      [...projects, id || ""],
    );
    if (taken) return { ok: false, error: `"${taken.project_name}" is already in ${taken.line}.` };
  }

  const previousLogo = id
    ? ((await row<{ logo_path: string | null }>("SELECT logo_path FROM product_lines WHERE id = ?", [id]))
        ?.logo_path ?? null)
    : null;

  let savedId: string;
  try {
    savedId = await transaction(async (conn) => {
      let lineId = id;
      if (lineId) {
        await updateById("product_lines", lineId, { name }, conn);
      } else {
        const count = await row<{ n: number }>("SELECT COUNT(*) AS n FROM product_lines", [], conn);
        lineId = await insert("product_lines", { name, sort_order: Number(count?.n ?? 0) }, conn);
      }
      // ---- projects
      await exec("DELETE FROM product_line_projects WHERE line_id = ?", [lineId], conn);
      await insertMany(
        "product_line_projects",
        projects.map((project_name, i) => ({ line_id: lineId, project_name, sort_order: i })),
        conn,
      );
      return lineId;
    });
  } catch (e) {
    return fail(e, `There's already a line called ${name}.`);
  }

  // ---- logo
  if (logo) {
    const relative = `product-lines/${savedId}/${Date.now()}-${safeFileName(logo.name)}`;
    try {
      await saveUpload("logos", relative, logo);
    } catch (e) {
      refresh();
      return { ok: false, error: `Saved, but the logo upload failed: ${errorMessage(e)}` };
    }
    await updateById("product_lines", savedId, { logo_path: relative });
    await removeUpload("logos", previousLogo);
  } else if (removeLogo && previousLogo) {
    await updateById("product_lines", savedId, { logo_path: null });
    await removeUpload("logos", previousLogo);
  }

  refresh();
  return { ok: true, id: savedId };
}

/** Apps keep their project names; they just lose the line's logo. */
export async function deleteProductLine(id: string): Promise<ActionResult> {
  await requireUser();
  const line = await row<{ logo_path: string | null }>("SELECT logo_path FROM product_lines WHERE id = ?", [id]);
  try {
    await exec("DELETE FROM product_lines WHERE id = ?", [id]);
  } catch (e) {
    return fail(e);
  }
  await removeUpload("logos", line?.logo_path);
  refresh();
  return { ok: true };
}

/**
 * Save a product line's generic store descriptions — one short + one full per
 * app role (6amMart User app, Store app, Delivery app …). A client can then
 * one-click these into the intake form. Scoped to the one line.
 */
export async function saveLineDescriptions(
  lineId: string,
  items: { project_name: string; short_description: string; long_description: string }[],
): Promise<ActionResult> {
  await requireUser();
  if (!lineId) return { ok: false, error: "That product line doesn't exist." };

  for (const it of items) {
    if (it.short_description.length > PLAY_LIMITS.shortDescription) {
      return { ok: false, error: `The short description for ${it.project_name} is too long (max ${PLAY_LIMITS.shortDescription}).` };
    }
    if (it.long_description.length > PLAY_LIMITS.longDescription) {
      return { ok: false, error: `The full description for ${it.project_name} is too long (max ${PLAY_LIMITS.longDescription}).` };
    }
  }

  try {
    await transaction(async (conn) => {
      for (const it of items) {
        await exec(
          `UPDATE product_line_projects SET short_description = ?, long_description = ?
             WHERE line_id = ? AND project_name = ?`,
          [it.short_description.trim() || null, it.long_description.trim() || null, lineId, it.project_name],
          conn,
        );
      }
    });
  } catch (e) {
    return fail(e);
  }
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------- support

export async function saveSupportArticle(fd: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(fd, "id");
  const category = str(fd, "category") || "General";
  const title = str(fd, "title");
  const body = str(fd, "body");
  if (!title) return { ok: false, error: "Give the entry a title." };
  if (!body) return { ok: false, error: "Add the solution." };

  const payload = { category, title, body };
  try {
    if (id) await updateById("support_articles", id, payload);
    else await insert("support_articles", payload);
  } catch (e) {
    return fail(e);
  }
  refresh();
  return { ok: true };
}

export async function deleteSupportArticle(id: string): Promise<ActionResult> {
  await requireUser();
  try {
    await exec("DELETE FROM support_articles WHERE id = ?", [id]);
  } catch (e) {
    return fail(e);
  }
  refresh();
  return { ok: true };
}

// ------------------------------------------------------------------- team

const PASSWORD_MIN = 8;

/**
 * A team member is an account: name, email and password. Adding one lets them
 * sign in straight away. Editing can change any of it; a blank password keeps
 * the current one. (Passwords are stored as bcrypt hashes, never as text.)
 */
export async function saveTeamMember(fd: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(fd, "id");
  const name = str(fd, "name");
  const email = str(fd, "email").toLowerCase();
  const password = String(fd.get("password") ?? "");
  const active = fd.get("active") !== null;

  if (!name) return { ok: false, error: "Name is required." };
  const badEmail = check(email, max(255), isEmail);
  if (!email || badEmail) return { ok: false, error: badEmail ?? "Email is required — they sign in with it." };
  if (!id && !password) return { ok: false, error: "Set a password for the new account." };
  if (password && password.length < PASSWORD_MIN) {
    return { ok: false, error: `Use at least ${PASSWORD_MIN} characters for the password.` };
  }
  if (password.length > 200) return { ok: false, error: "That password is too long." };
  const hash = password ? await bcrypt.hash(password, 10) : null;

  try {
    await transaction(async (conn) => {
      const existing = id
        ? await row<{ user_id: string | null }>("SELECT user_id FROM team_members WHERE id = ?", [id], conn)
        : null;
      if (id && !existing) throw new Error("That team member doesn't exist.");

      let userId = existing?.user_id ?? null;
      if (userId) {
        await updateById("users", userId, { email, name, ...(hash ? { password_hash: hash } : {}) }, conn);
      } else if (hash) {
        // The member row is written below; don't let the database add another.
        await setImporting(conn, true);
        try {
          userId = await insert("users", { email, password_hash: hash, name }, conn);
        } finally {
          await setImporting(conn, false);
        }
      }

      const member = { name, email, active, user_id: userId };
      if (id) await updateById("team_members", id, member, conn);
      else await insert("team_members", member, conn);
    });
  } catch (e) {
    return fail(e, "Another account already uses that email.");
  }
  refresh();
  return { ok: true };
}

/**
 * Members are referenced by assignments, so deactivating is the usual move —
 * it hides them from the pickers without rewriting history.
 */
export async function setTeamMemberActive(id: string, active: boolean): Promise<ActionResult> {
  await requireUser();
  try {
    await updateById("team_members", id, { active });
  } catch (e) {
    return fail(e);
  }
  refresh();
  return { ok: true };
}

/** Removes the member and their account (only someone with nothing assigned). */
export async function deleteTeamMember(id: string): Promise<ActionResult> {
  const me = await requireUser();
  const member = await row<{ user_id: string | null }>("SELECT user_id FROM team_members WHERE id = ?", [id]);
  if (!member) return { ok: false, error: "That team member doesn't exist." };
  if (member.user_id === me.userId) return { ok: false, error: "You can't delete your own account." };
  try {
    await transaction(async (conn) => {
      await exec("DELETE FROM team_members WHERE id = ?", [id], conn);
      if (member.user_id) await exec("DELETE FROM users WHERE id = ?", [member.user_id], conn);
    });
  } catch (e) {
    return fail(e);
  }
  refresh();
  return { ok: true };
}

// --------------------------------------------------------------------- auth

export async function signOut() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

// ------------------------------------------------------------ client intake

/**
 * A private link for the client to fill in their store details. A new link
 * replaces the old one, which stops working.
 */
export async function createIntakeLink(clientId: string): Promise<ActionResult> {
  await requireUser();
  const token = Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString("base64url");
  try {
    await updateById("clients", clientId, { intake_token: token });
  } catch (e) {
    return fail(e);
  }
  refresh();
  return { ok: true, id: token };
}

export async function disableIntakeLink(clientId: string): Promise<ActionResult> {
  await requireUser();
  try {
    await updateById("clients", clientId, { intake_token: null });
  } catch (e) {
    return fail(e);
  }
  refresh();
  return { ok: true };
}

const INTAKE_CLIENT_FIELDS = [
  "play_privacy_url",
  "play_delete_account_url",
  "play_contact_email",
  "play_listing_email",
  "play_contact_phone",
  "play_website",
  "play_default_language",
  "store_support_url",
  "store_marketing_url",
  "review_contact_first_name",
  "review_contact_last_name",
  "review_contact_phone",
  "review_contact_email",
] as const;

// Bundle IDs, categories, keywords and the like stay with the team.
const INTAKE_APP_FIELDS = [
  "app_name",
  "short_description",
  "long_description",
  "demo_login",
  "demo_password",
  "demo_details",
  "icon_url",
  "screenshots_url",
  "feature_graphic_url",
  "client_note",
] as const;


// The client's store accounts: name, type and how the team gets in.
const INTAKE_ACCOUNT_FIELDS = [
  "account_name",
  "account_type",
  "access_method",
  "access_email",
  "login_password",
] as const;

/** What each field the client can send must look like (see lib/validate). */
const INTAKE_RULES: Record<string, Rule[]> = {
  play_privacy_url: [max(300), isUrl],
  play_delete_account_url: [max(300), isUrl],
  play_website: [max(300), isUrl],
  store_support_url: [max(300), isUrl],
  store_marketing_url: [max(300), isUrl],
  play_contact_email: [max(100), isEmail],
  play_listing_email: [max(100), isEmail],
  review_contact_email: [max(100), isEmail],
  play_contact_phone: [max(30), isPhone],
  review_contact_phone: [max(30), isPhone],
  review_contact_first_name: [max(60), isName],
  review_contact_last_name: [max(60), isName],
  play_default_language: [max(100)],
  app_name: [max(Math.min(PLAY_LIMITS.appName, APP_STORE_LIMITS.appName))],
  short_description: [max(PLAY_LIMITS.shortDescription)],
  long_description: [max(PLAY_LIMITS.longDescription)],
  demo_login: [max(100), isEmailOrPhone],
  demo_password: [max(200)],
  demo_details: [max(500)],
  icon_url: [max(500), isUrl],
  screenshots_url: [max(500), isUrl],
  feature_graphic_url: [max(500), isUrl],
  client_note: [max(500)],
  account_name: [max(100)],
  access_email: [max(100), isEmail],
  login_password: [max(200)],
};

/** The first field that breaks its rule, as a message naming it. */
function intakeProblem(fields: Record<string, string | undefined>, owner?: string): string | null {
  for (const [key, value] of Object.entries(fields)) {
    const problem = check(value ?? "", ...(INTAKE_RULES[key] ?? []));
    if (problem) {
      const label = key.replace(/_url$/, "").replace(/_/g, " ");
      return `${owner ? `${owner} — ` : ""}${label}: ${problem}`;
    }
  }
  return null;
}

/**
 * The client's own submission from the intake form — no login; the link's
 * token decides which client it is, and only these fields are saved. The same
 * rules as the form are checked again here, so nothing skips them.
 */
/**
 * Read a client's website (from the intake form) and hand back the business
 * details we could find, for the client to check. Public, like the form itself.
 */
export async function autofillIntake(
  token: string,
  website: string,
): Promise<{ ok: true; data: Prefill } | { ok: false; error: string }> {
  // Only run for a real, unsubmitted intake link — not as an open fetch proxy.
  if (!token || token.length < 24) return { ok: false, error: "This link is no longer valid." };
  const client = await row<{ id: string }>(
    "SELECT id FROM clients WHERE intake_token = ? AND archived = FALSE",
    [token],
  );
  if (!client) return { ok: false, error: "This link is no longer valid." };
  return prefillFromWebsite(website);
}

export async function submitIntake(
  token: string,
  client: Record<string, string>,
  apps: ({ id: string } & Record<string, string>)[],
  accounts: ({ id: string } & Record<string, string>)[] = [],
): Promise<ActionResult> {
  const pick = <K extends string>(from: Record<string, string>, keys: readonly K[]) =>
    Object.fromEntries(
      keys.filter((k) => typeof from[k] === "string").map((k) => [k, from[k].trim()]),
    ) as Partial<Record<K, string>>;

  const clientData = pick(client, INTAKE_CLIENT_FIELDS);
  const clientProblem = intakeProblem(clientData);
  if (clientProblem) return { ok: false, error: clientProblem };

  const appData: ({ id: string } & Partial<Record<(typeof INTAKE_APP_FIELDS)[number], string>>)[] = [];
  for (const app of apps) {
    const fields = pick(app, INTAKE_APP_FIELDS);
    const problem = intakeProblem(fields, fields.app_name || "An app");
    if (problem) return { ok: false, error: problem };
    appData.push({ id: String(app.id), ...fields });
  }

  const accountData: ({ id: string } & Partial<Record<(typeof INTAKE_ACCOUNT_FIELDS)[number], string>>)[] = [];
  for (const account of accounts) {
    const fields = pick(account, INTAKE_ACCOUNT_FIELDS);
    const problem = intakeProblem(fields, fields.account_name || "A store account");
    if (problem) return { ok: false, error: problem };
    if (fields.account_type && !["organization", "personal"].includes(fields.account_type)) {
      return { ok: false, error: "Pick Organization or Personal for each store account." };
    }
    if (fields.access_method && !["invite", "login"].includes(fields.access_method)) {
      return { ok: false, error: "Pick how we'll get access to each store account." };
    }
    accountData.push({ id: String(account.id), ...fields });
  }

  if (!token || token.length < 24) return { ok: false, error: "This link is not valid." };
  const owner = await row<{ id: string }>(
    "SELECT id FROM clients WHERE intake_token = ? AND archived = FALSE",
    [token],
  );
  if (!owner) {
    return { ok: false, error: "This link is no longer active. Ask the team for a new one." };
  }

  // A sent field's new value (blank = cleared); an unsent field keeps its own.
  const blankToNull = (values: Record<string, string | undefined>) =>
    Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v ? v : null]));

  try {
    await transaction(async (conn) => {
      await updateById(
        "clients",
        owner.id,
        { ...blankToNull(clientData), intake_submitted_at: new Date() },
        conn,
      );

      for (const { id, demo_password, app_name, ...fields } of appData) {
        const update: Record<string, unknown> = blankToNull(fields);
        if (app_name !== undefined) update.app_name = app_name; // never NULL
        // A blank password keeps the saved one; the form never shows it.
        if (demo_password) update.demo_password = demo_password;
        if (Object.keys(update).length === 0) continue;
        // Only this client's own active apps.
        await exec("UPDATE products SET ? WHERE id = ? AND client_id = ? AND archived = FALSE", [update, id, owner.id], conn);
      }

      for (const { id, account_type, access_method, login_password, account_name, ...fields } of accountData) {
        const update: Record<string, unknown> = blankToNull(fields);
        if (account_name !== undefined) update.account_name = account_name; // never NULL
        if (account_type) update.account_type = account_type;
        if (access_method !== undefined) update.access_method = access_method || null;
        if (login_password) update.login_password = login_password;
        if (Object.keys(update).length === 0) continue;
        await exec("UPDATE publisher_accounts SET ? WHERE id = ? AND client_id = ?", [update, id, owner.id], conn);
      }
    });
  } catch (e) {
    return fail(e);
  }
  refresh();
  return { ok: true };
}

// -------------------------------------------------------------- store watch

/** Look one app up on its store right now (the hourly check does the rest). */
export async function checkStoreNow(
  productId: string,
): Promise<ActionResult & { needsPackageName?: boolean; clientId?: string }> {
  await requireUser();
  const [result] = await runStoreWatch({ productId });
  if (!result) {
    const p = await row<{ client_id: string }>("SELECT client_id FROM products WHERE id = ?", [productId]);
    return {
      ok: false,
      error: "This app has no package name or bundle ID yet.",
      needsPackageName: true,
      clientId: p?.client_id,
    };
  }
  if (result.error) return { ok: false, error: result.error };
  refresh();
  return { ok: true };
}

export async function syncAllStores(): Promise<
  | { ok: true; checked: number; live: number; updated: number; errors: number }
  | { ok: false; error: string }
> {
  await requireUser();
  try {
    const results = await runStoreWatch({ all: true });
    refresh();
    return {
      ok: true,
      checked: results.length,
      live: results.filter((r) => r.live).length,
      updated: results.filter((r) => r.adopted).length,
      errors: results.filter((r) => r.error).length,
    };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
