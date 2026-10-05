import type { Platform, Product } from "@/lib/types";

/** What Store Watch last saw on the app's store page. */
export type StoreInfo = {
  live: boolean | null;
  version: string | null;
  updatedAt: string | null;
  checkedAt: string | null;
  error: string | null;
  url: string | null;
};

export function storeInfoOf(
  product:
    | Pick<
        Product,
        "store_live" | "store_version" | "store_updated_at" | "store_checked_at" | "store_error" | "store_url"
      >
    | undefined,
): StoreInfo | null {
  if (!product) return null;
  return {
    live: product.store_live,
    version: product.store_version,
    updatedAt: product.store_updated_at,
    checkedAt: product.store_checked_at,
    error: product.store_error,
    url: product.store_url,
  };
}

/**
 * The version the store should show for this submission: the build name
 * ("1.0.7" of "1.0.7+10"), else the release's version.
 */
export function expectedVersion(buildVersion: string | null, releaseVersion: string | null): string {
  return (buildVersion?.split("+")[0] || releaseVersion || "").trim();
}

function versionParts(value: string | null | undefined): number[] | null {
  const name = String(value ?? "").split("+")[0].trim();
  if (!/^\d+(\.\d+)*$/.test(name)) return null;
  return name.split(".").map(Number);
}

export function compareVersions(a: string | null, b: string | null): number | null {
  const pa = versionParts(a);
  const pb = versionParts(b);
  if (!pa || !pb) return null;
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

/**
 * The store already has this submission live, but the tracker doesn't say so
 * yet — the developer should move it to Production. Nothing moves on its own.
 */
export function liveButNotMoved(
  store: StoreInfo | null,
  status: string,
  buildVersion: string | null,
  releaseVersion: string | null,
): boolean {
  if (!store?.live || status === "production") return false;
  const want = expectedVersion(buildVersion, releaseVersion);
  return !!want && store.version?.trim() === want;
}

export const STORE_NAME: Record<Platform, string> = {
  play_store: "Google Play",
  app_store: "the App Store",
};

/** "just now", "5m ago", "3h ago", "2d ago" — for when the store last changed. */
export function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
