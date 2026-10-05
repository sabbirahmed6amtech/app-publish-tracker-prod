import { rows, updateById } from "@/lib/db";
import { compareVersions } from "@/lib/storeWatch";

/**
 * Store Watch: is each app live on its store, and which version? Looks apps up
 * on the stores' public pages (no store logins) and saves what it finds:
 *
 *   Google Play  play.google.com/store/apps/details?id=<package>
 *                live = the page exists; version and update time from it
 *   App Store    itunes.apple.com/lookup?bundleId=<bundle id>
 *                live = a result; version, release date and link from it
 *
 * The store link is filled in the first time an app is seen live, never
 * overwritten. Run for every running app (latest submission not in
 * Production) by the hourly cron, or for one app by "Check now".
 */

type Found = { live: boolean; version: string | null; updatedAt: Date | null; url: string | null };

const BROWSER =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

async function checkPlay(pkg: string): Promise<Found> {
  const url = `https://play.google.com/store/apps/details?id=${encodeURIComponent(pkg)}`;
  // English, so the page always reads the same wherever this runs.
  const res = await fetch(`${url}&hl=en`, { headers: { "User-Agent": BROWSER }, cache: "no-store" });
  if (res.status === 404) return { live: false, version: null, updatedAt: null, url: null };
  if (!res.ok) throw new Error(`Google Play answered ${res.status}`);
  const page = await res.text();
  // The "About this app" data: version, then the update time in seconds.
  const version = page.match(/"141":\[\[\["([^"]+)"\]\]/)?.[1] ?? null;
  const seconds = page.match(/"146":\[\["[^"]*",\[(\d+)/)?.[1];
  return { live: true, version, updatedAt: seconds ? new Date(Number(seconds) * 1000) : null, url };
}

async function checkAppStore(bundleId: string): Promise<Found> {
  const res = await fetch(`https://itunes.apple.com/lookup?bundleId=${encodeURIComponent(bundleId)}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Apple answered ${res.status}`);
  const data = await res.json();
  const app = data?.results?.[0];
  if (!app) return { live: false, version: null, updatedAt: null, url: null };
  const released = app.currentVersionReleaseDate ?? app.releaseDate ?? null;
  return {
    live: true,
    version: app.version ?? null,
    updatedAt: released ? new Date(released) : null,
    // Drop Apple's tracking parameters.
    url: typeof app.trackViewUrl === "string" ? app.trackViewUrl.split("?")[0] : null,
  };
}

export type StoreWatchResult = {
  id: string;
  store: string;
  live?: boolean;
  version?: string | null;
  adopted?: string;
  error?: string;
};

export async function runStoreWatch(
  options: { productId?: string; all?: boolean } = {},
): Promise<StoreWatchResult[]> {
  const { productId, all } = options;
  const products = await rows<{
    id: string;
    package_name: string;
    store_url: string | null;
    platform: "play_store" | "app_store";
    latest_status: string | null;
    latest_app_id: string | null;
    latest_build: string | null;
  }>(
    `SELECT p.id, p.package_name, p.store_url, pa.platform,
            (SELECT a.status FROM apps a WHERE a.product_id = p.id ORDER BY a.created_at DESC LIMIT 1) AS latest_status,
            (SELECT a.id FROM apps a WHERE a.product_id = p.id ORDER BY a.created_at DESC LIMIT 1) AS latest_app_id,
            (SELECT a.build_version FROM apps a WHERE a.product_id = p.id ORDER BY a.created_at DESC LIMIT 1) AS latest_build
       FROM products p JOIN publisher_accounts pa ON pa.id = p.account_id
      WHERE p.package_name IS NOT NULL AND TRIM(p.package_name) <> ''
        AND ${productId ? "p.id = ?" : "p.archived = FALSE"}`,
    productId ? [productId] : [],
  );

  const due =
    productId || all
      ? products
      : products.filter((p) => p.latest_status && p.latest_status !== "production");

  const results: StoreWatchResult[] = [];
  for (const [i, p] of due.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, 800)); // gently
    const now = new Date();
    try {
      const found =
        p.platform === "app_store" ? await checkAppStore(p.package_name.trim()) : await checkPlay(p.package_name.trim());
      await updateById("products", p.id, {
        store_live: found.live,
        store_version: found.version,
        store_updated_at: found.updatedAt,
        store_checked_at: now,
        store_error: null,
        ...(found.live && found.url && !p.store_url?.trim() ? { store_url: found.url } : {}),
      });

      let adopted: string | undefined;
      const storeName = found.version?.split("+")[0].trim();
      if (found.live && storeName && p.latest_app_id) {
        const ahead = p.latest_build ? compareVersions(storeName, p.latest_build) === 1 : true;
        const current = p.latest_build?.split("+")[0].trim();
        if (ahead && storeName !== current) {
          await updateById("apps", p.latest_app_id, { build_version: storeName });
          adopted = storeName;
        }
      }

      results.push({ id: p.id, store: p.platform, live: found.live, version: found.version, adopted });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await updateById("products", p.id, { store_checked_at: now, store_error: message });
      results.push({ id: p.id, store: p.platform, error: message });
    }
  }
  return results;
}
