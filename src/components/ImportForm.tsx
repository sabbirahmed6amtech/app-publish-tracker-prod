"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { parseDelimited } from "@/lib/csv";
import { Spinner } from "@/components/Spinner";
import { importRows, type ImportRow } from "@/lib/actions";
import { STATUSES, STATUS_ORDER } from "@/lib/constants";
import type { AccountType, AppStatus, Platform } from "@/lib/types";

const COLUMNS = [
  "Ticket (Client)",
  "Platform",
  "Account Name",
  "Account Type",
  "Project Name",
  "App Name",
  "Status",
  "Version",
  "Flutter Version",
  "JKS",
  "Note",
];

const PLATFORM_CELL = /^(platform|play|app\s?store|google|android|ios|apple)/i;

function isSheetLayout(first: string[] | undefined): boolean {
  return !!first && PLATFORM_CELL.test((first[1] ?? "").trim());
}

function fromSheetRow(c: string[]): string[] {
  const g = (i: number) => c[i] ?? "";
  return [g(0), "", "", "", "", g(1), g(2), g(3), g(4), g(5), g(6), "", g(7), g(8), g(9), g(10), ""];
}

function readPlatform(v: string): Platform {
  return /play|android|google/i.test(v) ? "play_store" : "app_store";
}

function readAccountType(v: string): AccountType {
  return /person/i.test(v) ? "personal" : "organization";
}

function readStatus(v: string): AppStatus {
  const key = v.toLowerCase().replace(/[\s-]+/g, "_");
  const direct = STATUS_ORDER.find((s) => s === key);
  if (direct) return direct;
  const byLabel = STATUS_ORDER.find((s) => STATUSES[s].label.toLowerCase() === v.toLowerCase());
  if (byLabel) return byLabel;
  if (/live|publish/i.test(v)) return "production";
  if (/review|submit/i.test(v)) return "in_review";
  if (/reject|denied/i.test(v)) return "rejected";
  if (/test/i.test(v)) return "closed_testing";
  if (/hold|block|pause/i.test(v)) return "on_hold";
  return "ongoing";
}

/** Sheets leave grouping columns blank on continuation rows. */
function carry(prev: string, next: string): string {
  return next.trim() !== "" ? next.trim() : prev;
}

export function ImportForm() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [hasHeader, setHasHeader] = useState(true);
  const [fallbackVersion, setFallbackVersion] = useState("1.0.0");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const parsed = useMemo(() => {
    const grid = parseDelimited(text);
    if (grid.length === 0) return { rows: [] as ImportRow[], skipped: 0 };

    const sheet = isSheetLayout(grid[0]);
    const lines = sheet ? grid.map(fromSheetRow) : grid;
    const body = hasHeader ? lines.slice(1) : lines;
    const rows: ImportRow[] = [];
    let skipped = 0;

    let ticket = "";
    let clientName = "";
    let version = "";
    let releaseTitle = "";
    let assignedTo = "";
    let platform = "";
    let accountName = "";
    let accountType = "";

    for (const cells of body) {
      const c = (i: number) => (cells[i] ?? "").trim();

      // A sheet ticket cell often reads "12345 - Client name".
      const rawTicket = c(0);
      if (rawTicket) {
        const [num, ...rest] = rawTicket.split(/\s*[-–—]\s*/);
        ticket = num.trim();
        clientName = rest.join(" - ").trim() || clientName;
      }
      if (c(1)) clientName = c(1);

      version = carry(version, c(2));
      releaseTitle = carry(releaseTitle, c(3));
      assignedTo = carry(assignedTo, c(4));
      platform = carry(platform, c(5));
      accountName = carry(accountName, c(6));
      accountType = carry(accountType, c(7));

      const project = c(8);
      if (!ticket || !project) {
        if (cells.some((v) => v.trim() !== "")) skipped++;
        continue;
      }

      rows.push({
        ticket,
        client_name: clientName || ticket,
        release_version: version || fallbackVersion,
        release_title: releaseTitle,
        assigned_to: assignedTo,
        platform: readPlatform(platform),
        account_name: accountName,
        account_type: readAccountType(accountType),
        project_name: project,
        app_name: c(9),
        status: readStatus(c(10)),
        app_assigned_to: c(11),
        build_version: c(12),
        flutter_version: c(13),
        jks: c(14),
        note: c(15),
        store_url: c(16),
      });
    }

    return { rows, skipped };
  }, [text, hasHeader, fallbackVersion]);

  function run() {
    setError(null);
    setResult(null);
    start(async () => {
      const res = await importRows(parsed.rows);
      if (!res.ok) {
        setError(res.error ?? "Import failed.");
        return;
      }
      setResult(`${res.created} apps added, ${res.updated} updated.`);
      setText("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <section className="card overflow-hidden">
        <div className="border-b border-border px-4 py-2.5">
          <h2 className="text-[13px] font-semibold text-foreground">Paste rows</h2>
          <p className="text-[11px] text-muted-foreground">
            Tab-separated (straight out of Sheets) or CSV. Blank grouping cells carry down
            from the row above.
          </p>
        </div>

        <div className="px-4 py-3">
          <div className="mb-2 flex flex-wrap gap-1">
            {COLUMNS.map((col, i) => (
              <span
                key={col}
                className="rounded border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
              >
                {i + 1}. {col}
              </span>
            ))}
          </div>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            spellCheck={false}
            placeholder={
              "12345 - Client name\t\t1.0.0\t\tTeam member\tApp Store\tDeveloper account\tOrganization\tProject name\tApp name\tProduction"
            }
            className="field resize-y font-mono text-[12px] leading-relaxed"
          />

          <div className="mt-2 flex flex-wrap items-center gap-4">
            <label className="flex cursor-pointer select-none items-center gap-1.5 text-[12px] text-foreground/70">
              <input
                type="checkbox"
                checked={hasHeader}
                onChange={(e) => setHasHeader(e.target.checked)}
                className="size-3.5 accent-foreground"
              />
              First line is a header row
            </label>

            <label className="flex items-center gap-1.5 text-[12px] text-foreground/70">
              Version for rows that have none
              <input
                value={fallbackVersion}
                onChange={(e) => setFallbackVersion(e.target.value)}
                className="field w-24 py-1 font-mono text-[12px]"
              />
            </label>
          </div>
        </div>
      </section>

      {parsed.rows.length > 0 && (
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <h2 className="text-[13px] font-semibold text-foreground">
              Preview — {parsed.rows.length} rows
              {parsed.skipped > 0 && (
                <span className="ml-2 font-normal text-muted-foreground">
                  ({parsed.skipped} skipped: no ticket or project)
                </span>
              )}
            </h2>
            <button onClick={run} disabled={pending} className="btn btn-primary">
              {pending ? (
                <>
                  <Spinner /> Importing…
                </>
              ) : (
                `Import ${parsed.rows.length} rows`
              )}
            </button>
          </div>

          <div className="max-h-[420px] overflow-auto">
            <table className="w-full min-w-[900px] border-collapse">
              <thead className="sticky top-0 bg-card shadow-[0_1px_0_var(--border)]">
                <tr>
                  <th className="th">Ticket</th>
                  <th className="th">Client</th>
                  <th className="th">Version</th>
                  <th className="th">Assigned to</th>
                  <th className="th">Platform</th>
                  <th className="th">Project</th>
                  <th className="th">App</th>
                  <th className="th">Status</th>
                </tr>
              </thead>
              <tbody>
                {parsed.rows.map((r, i) => (
                  <tr key={i} className="border-b border-border/60 last:border-0">
                    <td className="td font-mono text-[12px]">{r.ticket}</td>
                    <td className="td">{r.client_name}</td>
                    <td className="td font-mono text-[12px]">{r.release_version}</td>
                    <td className="td">{r.assigned_to}</td>
                    <td className="td">{r.platform === "play_store" ? "Play" : "iOS"}</td>
                    <td className="td">{r.project_name}</td>
                    <td className="td">{r.app_name}</td>
                    <td className="td">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${STATUSES[r.status].chip}`}
                      >
                        {STATUSES[r.status].label}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {result && (
        <p className="rounded-md bg-good-soft px-3 py-2 text-[13px] text-good">
          {result}
        </p>
      )}
      {error && (
        <p className="rounded-md bg-bad-soft px-3 py-2 text-[13px] text-bad">{error}</p>
      )}
    </div>
  );
}
