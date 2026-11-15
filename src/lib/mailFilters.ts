import type { MailTicket } from "@/lib/types";

const STALE_MS = 3 * 24 * 60 * 60 * 1000;

const isOpen = (t: MailTicket) => t.status !== "resolved";

export function filtersFor(meId: string | null, now: number) {
  return [
    { key: "triage", label: "Needs triage", group: "triage", test: (t: MailTicket) => isOpen(t) && (!t.product_id || !t.assigned_to) },
    { key: "unmatched", label: "No app", group: "triage", test: (t: MailTicket) => isOpen(t) && !t.product_id },
    { key: "unassigned", label: "No owner", group: "triage", test: (t: MailTicket) => isOpen(t) && !t.assigned_to },
    { key: "stale", label: "Waiting 3+ days", group: "triage", test: (t: MailTicket) => isOpen(t) && now - Date.parse(t.opened_at) > STALE_MS },
    { key: "open", label: "All open", group: "view", test: isOpen },
    { key: "mine", label: "Mine", group: "view", test: (t: MailTicket) => isOpen(t) && !!meId && t.assigned_to === meId },
    { key: "rejected", label: "Rejections", group: "view", test: (t: MailTicket) => isOpen(t) && t.kind === "rejected" },
    { key: "build_issue", label: "Build issues", group: "view", test: (t: MailTicket) => isOpen(t) && t.kind === "build_issue" },
    { key: "resolved", label: "Resolved", group: "view", test: (t: MailTicket) => t.status === "resolved" },
  ] as const;
}

export type FilterKey = ReturnType<typeof filtersFor>[number]["key"];
export const FILTER_KEYS: FilterKey[] = filtersFor(null, 0).map((f) => f.key);
