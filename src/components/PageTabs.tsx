import Link from "next/link";

/**
 * Tabs that live in the URL (?tab=…), so each tab is a link, renders on the
 * server, and survives a refresh or a shared link.
 */
export function PageTabs({
  base,
  current,
  tabs,
}: {
  base: string;
  current: string;
  tabs: { key: string; label: string; count?: number }[];
}) {
  return (
    <nav className="mb-5 flex flex-wrap gap-1 border-b" aria-label="Sections">
      {tabs.map((t, i) => {
        const active = t.key === current;
        const href = i === 0 ? base : `${base}?tab=${t.key}`;
        return (
          <Link
            key={t.key}
            href={href}
            scroll={false}
            aria-current={active ? "page" : undefined}
            className={`-mb-px inline-flex h-9 shrink-0 items-center gap-1.5 border-b-2 px-3 text-[13px] font-medium transition-colors ${
              active
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            {t.count !== undefined && (
              <span className="rounded-full bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground">
                {t.count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/** Pick a known tab from a search param, falling back to the first. */
export function pickTab<T extends string>(value: string | undefined, keys: readonly T[]): T {
  return keys.includes(value as T) ? (value as T) : keys[0];
}
