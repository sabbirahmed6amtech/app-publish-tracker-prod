import Link from "next/link";
import { Suspense } from "react";
import { ChevronRightIcon } from "lucide-react";
import { TrackerSearch } from "@/components/tracker/TrackerSearch";
import { trackerSearch } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function TrackPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const q = ((await searchParams).q ?? "").trim();
  const results = q.length >= 2 ? await trackerSearch(q) : [];

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 text-center">
        <h1 className="text-[24px] font-semibold tracking-tight">Where&apos;s my app?</h1>
        <p className="mt-1.5 text-[14px] text-muted-foreground">
          Look up a client to see each app&apos;s status on the Play Store and App Store.
        </p>
      </div>

      <Suspense>
        <TrackerSearch autoFocus />
      </Suspense>

      <div className="mt-4">
        {q.length === 1 && (
          <p className="text-center text-[14px] text-muted-foreground">Keep typing…</p>
        )}

        {q.length >= 2 && results.length === 0 && (
          <div className="rounded-xl border border-dashed px-6 py-10 text-center">
            <p className="text-[14px] font-medium">No client matches “{q}”.</p>
            <p className="mt-1 text-[14px] text-muted-foreground">
              Try the ticket number, or the app&apos;s name as it appears in the store.
            </p>
          </div>
        )}

        {results.length > 0 && (
          <ul className="overflow-hidden rounded-xl border bg-card shadow-xs">
            {results.map((r) => (
              <li key={r.ticket} className="border-b last:border-0">
                <Link
                  href={`/track/${encodeURIComponent(r.ticket)}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary text-[14px] font-semibold text-primary-foreground">
                    {initials(r.name)}
                  </span>
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="flex items-baseline gap-2">
                      <span className="truncate text-[16px] font-semibold">{r.name}</span>
                      <span className="font-mono text-[12px] text-muted-foreground">
                        #{r.ticket}
                      </span>
                    </span>
                    {r.apps && (
                      <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
                        {r.apps}
                      </span>
                    )}
                  </span>
                  <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
