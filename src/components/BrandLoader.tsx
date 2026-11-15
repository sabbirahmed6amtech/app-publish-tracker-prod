import { BrandMark } from "@/components/BrandMark";

/**
 * The app's loading mark: the brand tile inside a spinning ring, hopping
 * dots, and three messages that take turns while you wait. Used by every
 * page's loading screen, above a skeleton of that page.
 */
export function BrandLoader({
  messages = ["Loading…", "Fetching the latest…", "Almost there…"],
}: {
  /** Three short lines, shown in turn. */
  messages?: [string, string, string];
}) {
  const lines = messages;

  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center gap-4 py-6">
      <div className="relative grid size-16 place-items-center">
        <svg viewBox="0 0 64 64" className="loader-ring absolute inset-0 size-16" aria-hidden>
          <circle cx="32" cy="32" r="29" fill="none" strokeWidth="3" className="stroke-border" />
          <circle
            cx="32"
            cy="32"
            r="29"
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="46 137"
            className="stroke-foreground"
          />
        </svg>
        <BrandMark className="size-10" />
      </div>

      <div className="flex items-center gap-1" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="loader-dot size-1.5 rounded-full bg-[var(--st-production)]"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>

      {/* Stacked in one grid cell so they swap in place. */}
      <div className="grid text-center text-[14px] text-muted-foreground">
        {lines.map((line, i) => (
          <span
            key={line}
            className="loader-line col-start-1 row-start-1"
            style={{ animationDelay: `${i * 1.5}s` }}
          >
            {line}
          </span>
        ))}
      </div>
      <span className="sr-only">Loading status</span>
    </div>
  );
}
