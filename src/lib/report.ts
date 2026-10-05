import { STATUSES } from "./constants";
import type { AppRow, AppStatus, Platform } from "./types";

/**
 * A plain-text status report, in the shape the team lead reads:
 *
 *   ### 52242 - Manuel Estevez camilo
 *   App Store: ✅
 *   User: https://apps.apple.com/…
 *   Store: https://apps.apple.com/…
 *
 *   Play Store: ⏳
 *   User: Production
 *   Store: In Review
 *
 * A live app shows its store link; anything else shows its status, so the
 * lead sees a URL exactly when there is something to open.
 */

/**
 * "6amMart-User-App" -> "User", "StackFood Delivery" -> "Delivery", given the
 * product line names (6amMart, StackFood …) from Settings. Anything that is not
 * from a known line keeps its full name, so a one-off like "Playground booking
 * app" is not mangled.
 */
export function appRole(projectName: string, lineNames: string[]): string {
  const name = projectName.trim();
  const prefixes = new Set(lineNames.map((l) => l.toLowerCase()));

  const dashed = name.match(/^(.+?)-(.+)-App$/i);
  if (dashed && prefixes.has(dashed[1].toLowerCase())) return dashed[2];

  const parts = name.split(/\s+/);
  if (parts.length >= 2 && prefixes.has(parts[0].toLowerCase())) {
    return parts.slice(1).join(" ");
  }
  return name;
}

export type ReportApp = {
  platform: Platform;
  projectName: string;
  status: AppStatus;
  storeUrl: string | null;
  note: string | null;
  sortOrder: number;
};

export type ReportInput = {
  ticket: string;
  clientName: string;
  label: string;
  note: string | null;
  apps: ReportApp[];
};

/** App Store first, matching how the report is usually read. */
const PLATFORM_ORDER: Platform[] = ["app_store", "play_store"];
const PLATFORM_LABEL: Record<Platform, string> = {
  app_store: "App Store",
  play_store: "Play Store",
};

function platformMark(apps: ReportApp[]): string {
  if (apps.some((a) => a.status === "rejected" || a.status === "on_hold")) return "❌";
  if (apps.every((a) => a.status === "production")) return "✅";
  return "⏳";
}

export function buildReport(inputs: ReportInput[], lineNames: string[] = []): string {
  return inputs
    .map((input) => {
      const lines: string[] = [`### ${input.ticket} - ${input.clientName}`];

      const details = [input.label, input.note ?? ""]
        .map((s) => s.trim())
        .filter(Boolean)
        .join(" — ");
      if (details) lines.push(details);

      const blocks: string[] = [];

      for (const platform of PLATFORM_ORDER) {
        const apps = input.apps
          .filter((a) => a.platform === platform)
          .sort((a, b) => a.sortOrder - b.sortOrder);
        if (apps.length === 0) continue;

        const block = [`${PLATFORM_LABEL[platform]}: ${platformMark(apps)}`];

        for (const app of apps) {
          // Live apps are worth a link; everything else is worth a status.
          const value =
            app.status === "production" && app.storeUrl
              ? app.storeUrl
              : STATUSES[app.status].label;

          // Parenthesised: notes often contain a dash of their own.
          const suffix = app.status !== "production" && app.note ? ` (${app.note})` : "";
          block.push(`${appRole(app.projectName, lineNames)}: ${value}${suffix}`);
        }
        blocks.push(block.join("\n"));
      }

      if (blocks.length === 0) blocks.push("_No apps in this release yet._");

      return `${lines.join("\n")}\n${blocks.join("\n\n")}`;
    })
    .join("\n\n");
}

/** Group flattened rows by release, newest client order preserved. */
export function reportFromRows(rows: AppRow[], lineNames: string[] = []): string {
  const groups = new Map<string, ReportInput>();

  for (const r of rows) {
    let group = groups.get(r.release_id);
    if (!group) {
      group = {
        ticket: r.ticket,
        clientName: r.client_name,
        label: r.release_label,
        note: r.release_note,
        apps: [],
      };
      groups.set(r.release_id, group);
    }
    group.apps.push({
      platform: r.platform,
      projectName: r.project_name,
      status: r.status,
      storeUrl: r.store_url,
      note: r.note,
      sortOrder: r.sort_order,
    });
  }

  return buildReport([...groups.values()], lineNames);
}
