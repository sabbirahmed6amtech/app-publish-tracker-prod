import { ImportForm } from "@/components/ImportForm";
import { ExportButton } from "@/components/ExportButton";
import { flatten, flattenLatest, getClients, getTeam, teamIndex } from "@/lib/queries";
import { EXPORT_HEADERS } from "@/lib/csv";

/** Move the old sheet in, or take a snapshot out. */
export async function DataSettings() {
  const [clients, roster] = await Promise.all([getClients(), getTeam()]);
  const names = teamIndex(roster);
  const rows = flatten(clients, names);
  const running = flattenLatest(clients, names).filter((r) => r.status !== "production");

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-muted-foreground">
          Move the old sheet in, or take a snapshot out.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <ExportButton
            rows={running}
            label={`Export ${running.length} running apps`}
            filename="running"
          />
          <ExportButton rows={rows} label={`Export all ${rows.length} apps`} />
        </div>
      </div>

      <ImportForm />

      <section className="card mt-4 px-4 py-4">
        <h2 className="text-[13px] font-semibold text-foreground">How re-importing works</h2>
        <ul className="mt-2 space-y-1.5 text-[13px] text-foreground/70">
          <li>
            Clients match on <strong className="font-medium">ticket number</strong>.
          </li>
          <li>
            Store accounts match on{" "}
            <strong className="font-medium">client + platform</strong> — one per store.
          </li>
          <li>
            Releases match on <strong className="font-medium">client + version</strong>, so all
            rows sharing a version land in the same release.
          </li>
          <li>
            A client&apos;s apps match on{" "}
            <strong className="font-medium">store account + project name</strong>; the
            sheet&apos;s app name and store link update the app itself.
          </li>
          <li>
            Each row is that app&apos;s submission in the release, so re-importing an edited
            export updates rather than duplicates.
          </li>
        </ul>

        <h2 className="mt-5 text-[13px] font-semibold text-foreground">Export columns</h2>
        <p className="mt-1.5 font-mono text-[11px] leading-relaxed text-muted-foreground">
          {EXPORT_HEADERS.join(" · ")}
        </p>
      </section>
    </>
  );
}
