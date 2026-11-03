import type { AppRow } from "./types";
import { ACCOUNT_TYPES, PLATFORMS, STATUSES } from "./constants";

export const EXPORT_HEADERS = [
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
] as const;

function escape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function rowsToCsv(rows: AppRow[]): string {
  const lines = [EXPORT_HEADERS.join(",")];

  const sorted = [...rows].sort(
    (a, b) =>
      a.ticket.localeCompare(b.ticket, undefined, { numeric: true }) ||
      a.platform.localeCompare(b.platform) ||
      a.account_name.localeCompare(b.account_name),
  );

  let prevClient = "";
  let prevAccount = "";

  for (const r of sorted) {
    const accountKey = `${r.client_id}|${r.platform}|${r.account_name}`;
    const sameClient = r.client_id === prevClient;
    const sameAccount = sameClient && accountKey === prevAccount;
    prevClient = r.client_id;
    prevAccount = accountKey;

    lines.push(
      [
        sameClient ? "" : `${r.ticket} - ${r.client_name}`,
        sameAccount ? "" : PLATFORMS[r.platform].label,
        sameAccount ? "" : r.account_name,
        ACCOUNT_TYPES[r.account_type].label,
        r.project_name,
        r.app_name,
        STATUSES[r.status].label,
        r.build_version ?? "",
        r.flutter_version ?? "",
        r.jks ?? "",
        r.note ?? "",
      ]
        .map((v) => escape(String(v ?? "")))
        .join(","),
    );
  }

  return lines.join("\n");
}

/** Split one delimited line, honouring "quoted, fields". */
function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function parseDelimited(text: string): string[][] {
  const raw = text.replace(/\r\n?/g, "\n").trim();
  if (!raw) return [];
  // Copying a block out of Sheets gives tabs; a downloaded file gives commas.
  const delimiter = raw.split("\n")[0].includes("\t") ? "\t" : ",";
  return raw
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => splitLine(l, delimiter));
}
