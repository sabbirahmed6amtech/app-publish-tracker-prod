import type { AccountType, App, AppStatus, Platform, ReleaseState } from "./types";

/**
 * Status colors come from the data-viz palette and are validated, not chosen
 * by eye: the pipeline order below clears every adjacent CVD gate
 * (worst 14.7 deutan) and the normal-vision floor (16.7).
 *
 * Red and green are inherently close for deuteranopes — that is true of any
 * semantic status palette — so every status also carries a distinct SHAPE and
 * a visible label. Colour never carries meaning on its own here.
 */
export const STATUSES: Record<
  AppStatus,
  {
    label: string;
    /** A CSS colour (a variable, so it follows light and dark mode). */
    hex: string;
    dot: string;
    chip: string;
    glyph: StatusGlyph;
    group: "active" | "attention" | "done";
  }
> = {
  ongoing: {
    label: "Ongoing",
    hex: "var(--st-ongoing)",
    dot: "bg-[var(--st-ongoing)]",
    chip: "bg-[#e8f1fc] text-[#184f95] ring-[#3987e5]/25 dark:bg-[#3987e5]/16 dark:text-[#9cc4f5] dark:ring-[#3987e5]/40",
    glyph: "circle",
    group: "active",
  },
  in_review: {
    label: "In Review",
    hex: "var(--st-in-review)",
    dot: "bg-[var(--st-in-review)]",
    chip: "bg-[#fef5e1] text-[#8a5a00] ring-[#fab219]/40 dark:bg-[#fab219]/16 dark:text-[#f7c75a] dark:ring-[#fab219]/40",
    glyph: "half",
    group: "active",
  },
  closed_testing: {
    label: "Closed Testing",
    hex: "var(--st-closed-testing)",
    dot: "bg-[var(--st-closed-testing)]",
    chip: "bg-[#eceafa] text-[#372b7d] ring-[#4a3aa7]/25 dark:bg-[#7b6be0]/16 dark:text-[#c3baf5] dark:ring-[#7b6be0]/40",
    glyph: "target",
    group: "active",
  },
  production: {
    label: "Production",
    hex: "var(--st-production)",
    dot: "bg-[var(--st-production)]",
    chip: "bg-[#e7f6e7] text-[#076b07] ring-[#0ca30c]/25 dark:bg-[#0ca30c]/16 dark:text-[#86dc86] dark:ring-[#0ca30c]/40",
    glyph: "check",
    group: "done",
  },
  on_hold: {
    label: "On Hold",
    hex: "var(--st-on-hold)",
    dot: "bg-[var(--st-on-hold)]",
    chip: "bg-[#fdeef3] text-[#a63b64] ring-[#e87ba4]/35 dark:bg-[#e87ba4]/16 dark:text-[#f5b0ca] dark:ring-[#e87ba4]/40",
    glyph: "pause",
    group: "attention",
  },
  rejected: {
    label: "Rejected",
    hex: "var(--st-rejected)",
    dot: "bg-[var(--st-rejected)]",
    chip: "bg-[#fbebeb] text-[#9b2c2c] ring-[#d03b3b]/25 dark:bg-[#d03b3b]/16 dark:text-[#f5a3a3] dark:ring-[#d03b3b]/45",
    glyph: "cross",
    group: "attention",
  },
};

/** Shape channel, so a status is never identified by colour alone. */
export type StatusGlyph = "circle" | "half" | "target" | "check" | "pause" | "cross";

/** Left-to-right pipeline order — this exact sequence is what was validated. */
export const PIPELINE_ORDER: AppStatus[] = [
  "ongoing",
  "in_review",
  "closed_testing",
  "production",
  "on_hold",
  "rejected",
];

export const STATUS_ORDER: AppStatus[] = [
  "rejected",
  "in_review",
  "closed_testing",
  "ongoing",
  "on_hold",
  "production",
];

export const PLATFORMS: Record<Platform, { label: string; short: string }> = {
  play_store: { label: "Play Store", short: "Play" },
  app_store: { label: "App Store", short: "iOS" },
};

export const ACCOUNT_TYPES: Record<AccountType, { label: string }> = {
  organization: { label: "Organization" },
  personal: { label: "Personal" },
};

/**
 * Play Console's app categories, spelled exactly as the console shows them —
 * the publisher extension picks the option by its exact text.
 */
export const PLAY_CATEGORIES = [
  "Art & Design", "Auto & Vehicles", "Beauty", "Books & Reference", "Business", "Comics",
  "Communication", "Dating", "Education", "Entertainment", "Events", "Finance", "Food & Drink",
  "Health & Fitness", "House & Home", "Libraries & Demo", "Lifestyle", "Maps & Navigation",
  "Medical", "Music & Audio", "News & Magazines", "Parenting", "Personalization",
  "Photography", "Productivity", "Shopping", "Social", "Sports", "Tools", "Travel & Local",
  "Video Players & Editors", "Weather",
];

/** Common default languages, in Play Console's exact "Name – code" form. */
export const PLAY_LANGUAGES = [
  "English (United Kingdom) – en-GB",
  "English (United States) – en-US",
  "Arabic – ar",
  "Bangla – bn-BD",
  "French (France) – fr-FR",
  "German – de-DE",
  "Hindi – hi-IN",
  "Indonesian – id",
  "Portuguese (Brazil) – pt-BR",
  "Spanish (Latin America) – es-419",
  "Spanish (Spain) – es-ES",
  "Spanish (United States) – es-US",
  "Turkish – tr-TR",
];

/** App Store Connect's categories, spelled as it shows them. */
export const APP_STORE_CATEGORIES = [
  "Books", "Business", "Developer Tools", "Education", "Entertainment", "Finance",
  "Food & Drink", "Games", "Graphics & Design", "Health & Fitness", "Kids", "Lifestyle",
  "Magazines & Newspapers", "Medical", "Music", "Navigation", "News", "Photo & Video",
  "Productivity", "Reference", "Shopping", "Social Networking", "Sports", "Travel",
  "Utilities", "Weather",
];

/** App Store Connect's length limits. */
export const APP_STORE_LIMITS = {
  appName: 30,
  subtitle: 30,
  keywords: 100,
  promoText: 170,
  description: 4000,
};

/** Play Console's length limits for the store listing. */
export const PLAY_LIMITS = { appName: 30, shortDescription: 80, longDescription: 4000 };

/** How many days in a non-terminal status before we flag it as stale. */
export const STALE_AFTER_DAYS = 7;

export function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export function isStale(status: AppStatus, statusChangedAt: string): boolean {
  if (status === "production") return false;
  return daysSince(statusChangedAt) >= STALE_AFTER_DAYS;
}

export const RELEASE_STATES: Record<
  ReleaseState,
  { label: string; dot: string; chip: string }
> = {
  empty: {
    label: "No apps",
    dot: "bg-muted-foreground/40",
    chip: "bg-muted text-muted-foreground ring-border",
  },
  in_progress: {
    label: "In progress",
    dot: "bg-[var(--st-ongoing)]",
    chip: "bg-info-soft text-info ring-[#3987e5]/30",
  },
  waiting: {
    label: "With the stores",
    dot: "bg-[var(--st-in-review)]",
    chip: "bg-warn-soft text-warn ring-[#fab219]/40",
  },
  attention: {
    label: "Needs attention",
    dot: "bg-[var(--st-rejected)]",
    chip: "bg-bad-soft text-bad ring-[#d03b3b]/30",
  },
  complete: {
    label: "Complete",
    dot: "bg-[var(--st-production)]",
    chip: "bg-good-soft text-good ring-[#0ca30c]/30",
  },
};

/**
 * A release shows the least-finished thing happening inside it: anything
 * blocked outranks anything waiting, which outranks work still in progress.
 */
export function releaseState(apps: Pick<App, "status">[]): ReleaseState {
  if (apps.length === 0) return "empty";
  if (apps.some((a) => a.status === "rejected" || a.status === "on_hold"))
    return "attention";
  if (apps.every((a) => a.status === "production")) return "complete";
  if (apps.some((a) => a.status === "in_review" || a.status === "closed_testing"))
    return "waiting";
  return "in_progress";
}

export function releaseLabel(release: {
  title?: string | null;
  started_on?: string | null;
  version?: string | null;
}): string {
  const title = release.title?.trim();
  if (title) return title;
  if (release.started_on) return formatReleaseDate(release.started_on);
  return release.version?.trim() || "Untitled";
}

export function formatReleaseDate(date: string): string {
  const d = new Date(`${date.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/** Suggest a next version from what the client already shipped. */
export function suggestNextVersion(existing: string[]): string {
  const numeric = existing
    .map((v) => v.trim().match(/^(\d+)\.(\d+)(?:\.(\d+))?$/))
    .filter(Boolean) as RegExpMatchArray[];

  if (numeric.length === 0) return "1.0.0";

  const latest = numeric
    .map((m) => [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)] as const)
    .sort((a, b) => b[0] - a[0] || b[1] - a[1] || b[2] - a[2])[0];

  return `${latest[0]}.${latest[1] + 1}.0`;
}

/**
 * The next build number for a new release: the last version part and the
 * build after "+" both go up by one — 1.0.6+9 -> 1.0.7+10, 2.1 -> 2.2.
 * Anything that doesn't end in a number gives null, to be filled in by hand.
 */
export function bumpBuild(build: string | null | undefined): string | null {
  const [version, code, ...rest] = (build ?? "").trim().split("+");
  if (!version || rest.length) return null;

  const bumped = version.match(/^(.*?)(\d+)$/);
  if (!bumped) return null;
  const nextVersion = `${bumped[1]}${Number(bumped[2]) + 1}`;

  if (code === undefined) return nextVersion;
  if (!/^\d+$/.test(code)) return null;
  return `${nextVersion}+${Number(code) + 1}`;
}

/** "rafi" -> "Rafi"; names someone already capitalised are left alone. */
export function displayName(name: string): string {
  return name === name.toLowerCase()
    ? name.replace(/\b\p{L}/gu, (c) => c.toUpperCase())
    : name;
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Relative effort each state actually demands of the person holding it.
 * A fresh build is real work — assets, metadata, submission — while an app
 * sitting in review is just waiting, so one Ongoing app outweighs three
 * In Review ones (4 > 3 x 1). Rejected costs about as much as a fresh build,
 * because it means rework and resubmission.
 *
 * Tune these to match how the work actually feels.
 */
export const EFFORT_WEIGHT: Record<AppStatus, number> = {
  ongoing: 4,
  rejected: 4,
  closed_testing: 1,
  in_review: 1,
  on_hold: 1,
  production: 0,
};
