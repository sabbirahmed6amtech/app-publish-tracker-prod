import type { Platform } from "@/lib/types";

export type MailSource = "app_store" | "play_store" | "firebase" | "google_cloud" | "other";

export type MailKind =
  | "rejected"
  | "build_issue"
  | "policy"
  | "removed"
  | "suspension"
  | "account"
  | "membership"
  | "crash_alert"
  | "approved"
  | "live"
  | "in_review"
  | "testflight"
  | "build_processed"
  | "stability"
  | "other";

export type MailInput = {
  gmailId: string;
  threadId: string | null;
  from: string;
  subject: string;
  snippet: string;
  body: string;
  receivedAt: string;
};

export type Classified = {
  source: MailSource;
  kind: MailKind;
  action: boolean;
  label: string | null;
  platform: Platform | null;
};

type Tone = "bad" | "warn" | "good" | "info" | "muted";

export const MAIL_KINDS: Record<MailKind, { label: string; tone: Tone }> = {
  rejected: { label: "Rejected", tone: "bad" },
  build_issue: { label: "Build issue", tone: "bad" },
  policy: { label: "Policy issue", tone: "bad" },
  removed: { label: "Removed", tone: "bad" },
  suspension: { label: "Suspension risk", tone: "bad" },
  account: { label: "Account action", tone: "warn" },
  membership: { label: "Membership", tone: "warn" },
  crash_alert: { label: "Crash alert", tone: "warn" },
  approved: { label: "Approved", tone: "good" },
  live: { label: "Live", tone: "good" },
  in_review: { label: "In review", tone: "info" },
  testflight: { label: "TestFlight", tone: "info" },
  build_processed: { label: "Build processed", tone: "muted" },
  stability: { label: "Stability report", tone: "muted" },
  other: { label: "Notice", tone: "muted" },
};

export const MAIL_SOURCES: Record<MailSource, string> = {
  app_store: "App Store Connect",
  play_store: "Google Play",
  firebase: "Firebase",
  google_cloud: "Google Cloud",
  other: "Other",
};

export const TONE_DOT: Record<Tone, string> = {
  bad: "bg-[var(--st-rejected)]",
  warn: "bg-[var(--st-in-review)]",
  good: "bg-[var(--st-production)]",
  info: "bg-[var(--st-ongoing)]",
  muted: "bg-muted-foreground/40",
};

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
};

export function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

export function nameKey(text: string | null | undefined): string {
  return decodeEntities(String(text ?? ""))
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

const APPLE_OS = "(?:iOS|macOS|tvOS|visionOS|watchOS)";

type Rule = {
  kind: MailKind;
  action: boolean;
  subject: RegExp;
  platform?: Platform;
};

const APPLE_RULES: Rule[] = [
  { kind: "rejected", action: true, subject: new RegExp(`issue with your (.+?) \\(${APPLE_OS}\\) submission`, "i") },
  { kind: "build_issue", action: true, subject: /uploaded build for (.+?) has one or more issues/i },
  { kind: "approved", action: false, subject: new RegExp(`review of your (.+?) \\(${APPLE_OS}\\) submission is complete`, "i") },
  { kind: "approved", action: false, subject: /your submission (?:for (.+?) )?(?:was|has been) (?:accepted|approved)/i },
  { kind: "testflight", action: false, subject: /(.+?) [\d.]+ \(\d+\)(?: for \w+)? is now available to test/i },
  { kind: "testflight", action: false, subject: /has invited you to test (.+?)\.?$/i },
  { kind: "build_processed", action: false, subject: /(.+?) [\d.]+ \(\d+\) has completed processing/i },
  { kind: "build_processed", action: false, subject: /(.+?) has completed processing/i },
  { kind: "membership", action: true, subject: /(?:membership|agreement).*(?:expir|renew|updated|review)/i },
];

const PLAY_RULES: Rule[] = [
  { kind: "policy", action: true, subject: /not compliant with Google Play Polic(?:y|ies)\s*\((.+)\)\s*$/i },
  { kind: "removed", action: true, subject: /(?:app|apps)\b.*\b(?:removed|suspended|unpublished)\b.*?(?:\((.+)\))?\s*$/i },
  { kind: "rejected", action: true, subject: /\brejected\b.*?(?:\((.+)\))?\s*$/i },
  { kind: "live", action: false, subject: /(?:is now live|has been published|now available on Google Play|update.*\bapproved\b|published on Google Play)(?:.*?\((.+)\))?/i },
  { kind: "in_review", action: false, subject: /(?:in review|under review)(?:.*?\((.+)\))?/i },
  { kind: "policy", action: true, subject: /(?:action required|policy|violation|warning).*?(?:\((.+)\))?\s*$/i },
];

function statusLine(subject: string): Rule | null {
  const m = subject.match(/status of your (?:\(?\w+\)? )?app,? (.+?),? is now ["'“]?([^"'”]+)["'”]?/i);
  if (!m) return null;
  const s = m[2].toLowerCase();
  const kind: MailKind = /ready for (?:sale|distribution)/.test(s)
    ? "live"
    : /metadata rejected|^rejected|invalid binary/.test(s)
      ? "rejected"
      : /review/.test(s)
        ? "in_review"
        : /pending developer release|accepted/.test(s)
          ? "approved"
          : "other";
  return { kind, action: kind === "rejected", subject: /status of your (?:\(?\w+\)? )?app,? (.+?),? is now/i };
}

function firstMatch(rules: Rule[], subject: string) {
  for (const rule of rules) {
    const m = subject.match(rule.subject);
    if (m) return { rule, label: m[1]?.trim() || null };
  }
  return null;
}

function sourceOf(from: string, subject: string): MailSource {
  const f = from.toLowerCase();
  if (f.includes("apple.com")) return "app_store";
  if (f.includes("firebase")) return "firebase";
  if (/cloudplatform|cloud platform|google cloud/.test(f) || /^your project:/i.test(subject)) return "google_cloud";
  if (f.includes("google.com") && /google play|play console|android/i.test(`${f} ${subject}`)) return "play_store";
  return "other";
}

const URGENT = /action required|rejected|suspen|removed|violation|not compliant|terminat/i;

export function classify(mail: Pick<MailInput, "from" | "subject">): Classified {
  const subject = decodeEntities(mail.subject).replace(/\s+/g, " ").trim();
  const source = sourceOf(mail.from, subject);

  if (source === "app_store") {
    const status = statusLine(subject);
    const hit = status
      ? { rule: status, label: subject.match(status.subject)?.[1]?.trim() ?? null }
      : firstMatch(APPLE_RULES, subject);
    if (hit) return { source, kind: hit.rule.kind, action: hit.rule.action, label: hit.label, platform: "app_store" };
    return { source, kind: "other", action: URGENT.test(subject), label: null, platform: "app_store" };
  }

  if (source === "play_store") {
    const hit = firstMatch(PLAY_RULES, subject);
    if (hit) return { source, kind: hit.rule.kind, action: hit.rule.action, label: hit.label, platform: "play_store" };
    return { source, kind: "other", action: URGENT.test(subject), label: null, platform: "play_store" };
  }

  if (source === "firebase") {
    const m = subject.match(/\b(Android|iOS)\s+([A-Za-z][\w]*(?:\.[\w]+)+)/);
    const platform: Platform | null = m ? (m[1] === "iOS" ? "app_store" : "play_store") : null;
    const alert = /velocity|new fatal|regress|spike/i.test(subject);
    return {
      source,
      kind: alert ? "crash_alert" : "stability",
      action: alert,
      label: m?.[2] ?? null,
      platform,
    };
  }

  if (source === "google_cloud") {
    const m = subject.match(/project:?\s+([\w-]+)/i);
    const action = URGENT.test(subject) || /at risk|past due|verify/i.test(subject);
    return {
      source,
      kind: /suspen/i.test(subject) ? "suspension" : action ? "account" : "other",
      action,
      label: m?.[1] ?? null,
      platform: null,
    };
  }

  return { source, kind: "other", action: false, label: null, platform: null };
}

export type TicketStatus = "open" | "in_progress" | "resolved";

export const TICKET_STATUSES: Record<TicketStatus, { label: string; tone: Tone }> = {
  open: { label: "Open", tone: "bad" },
  in_progress: { label: "In progress", tone: "info" },
  resolved: { label: "Resolved", tone: "good" },
};

export const ticketRef = (n: number) => `SM-${n}`;

export function when(iso: string): string {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
    hour: "numeric",
    minute: "2-digit",
  });
}

export function shortAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function cleanSubject(subject: string, appLabel?: string | null): string {
  let text = subject.replace(/^\s*\[?action required\]?:?\s*/i, "");
  if (appLabel) text = text.replace(new RegExp(`\\s*\\(${escapeRegex(appLabel)}\\)\\s*$`), "");
  text = text.trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : subject;
}

export function senderName(sender: string): string {
  return sender.replace(/<[^>]*>/, "").replace(/"/g, "").trim() || sender;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export function gmailLink(mailbox: string, gmailId: string, threadId?: string | null): string {
  return `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(mailbox)}#all/${threadId || gmailId}`;
}
