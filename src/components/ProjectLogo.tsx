import type { LineBadge } from "@/lib/types";

const SIZES = {
  xs: "size-5 rounded text-[11px]",
  sm: "size-7 rounded-md text-[11px]",
  md: "size-9 rounded-lg text-[12px]",
  lg: "size-12 rounded-xl text-[14px]",
} as const;

/**
 * An app's product-line logo. Without an uploaded logo it falls back to the
 * line's initials, and without a line to the project's — so every app still
 * gets a recognisable mark.
 */
export function ProjectLogo({
  badge,
  project,
  size = "sm",
}: {
  badge?: LineBadge | null;
  project: string;
  size?: keyof typeof SIZES;
}) {
  const label = badge?.line ?? project;

  if (badge?.logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- storage-hosted logo of unknown size
      <img
        src={badge.logo}
        alt={badge.line}
        title={badge.line}
        // A white tile keeps any logo legible; dimmed a touch so it doesn't glare in dark mode.
        className={`${SIZES[size]} shrink-0 border bg-white object-contain p-0.5 dark:brightness-[0.85]`}
      />
    );
  }

  return (
    <span
      title={badge?.line ?? "No product line"}
      className={`${SIZES[size]} grid shrink-0 place-items-center border bg-muted font-semibold uppercase text-muted-foreground`}
    >
      {initials(label)}
    </span>
  );
}

function initials(name: string): string {
  const words = name.replace(/[-_]/g, " ").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2);
  return words[0][0] + words[1][0];
}
