"use client";

import { loadGis } from "@/lib/driveClient";
import type { MailInput } from "@/lib/mailRules";

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
const SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const TOK_KEY = "apt_gmail_tok";
const EXP_KEY = "apt_gmail_exp";
const BODY_LIMIT = 6000;
const MAX_MESSAGES = 200;
const RETRIES = 3;
const QUOTA_WAIT_MS = 65_000;
const CONCURRENCY = 2;
const SENDERS = [
  "from:email.apple.com",
  "from:firebase-noreply@google.com",
  "from:cloudplatform-noreply@google.com",
  'from:"Google Play"',
  "from:play-console",
  "from:googleplay",
].join(" ");

type TokenResp = { access_token?: string; expires_in?: number; error?: string };

export class GmailAuthError extends Error {}

export function storedGmailToken(): string | null {
  try {
    const t = localStorage.getItem(TOK_KEY);
    const e = Number(localStorage.getItem(EXP_KEY));
    return t && e && Date.now() < e ? t : null;
  } catch {
    return null;
  }
}

export function forgetGmailToken() {
  try {
    localStorage.removeItem(TOK_KEY);
    localStorage.removeItem(EXP_KEY);
  } catch {}
}

export async function requestGmailToken(clientId: string): Promise<string> {
  await loadGis();
  const google = (window as unknown as { google: any }).google; // eslint-disable-line @typescript-eslint/no-explicit-any
  return new Promise<string>((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (resp: TokenResp) => {
        if (resp.error || !resp.access_token) return reject(new Error(resp.error || "No token"));
        try {
          localStorage.setItem(TOK_KEY, resp.access_token);
          localStorage.setItem(
            EXP_KEY,
            String(Date.now() + (Number(resp.expires_in) || 3600) * 1000 - 60_000),
          );
        } catch {}
        resolve(resp.access_token);
      },
      error_callback: (err: { message?: string; type?: string }) =>
        reject(new Error(err?.message || err?.type || "Google sign-in was closed.")),
    });
    try {
      client.requestAccessToken();
    } catch (e) {
      reject(e as Error);
    }
  });
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

let quotaWait: Promise<void> | null = null;
let onQuotaWait: ((seconds: number) => void) | null = null;

export function setQuotaWaitListener(listener: ((seconds: number) => void) | null) {
  onQuotaWait = listener;
}

function waitOutQuota(): Promise<void> {
  if (quotaWait) return quotaWait;
  onQuotaWait?.(Math.round(QUOTA_WAIT_MS / 1000));
  const pending: Promise<void> = wait(QUOTA_WAIT_MS).then(() => {
    quotaWait = null;
  });
  quotaWait = pending;
  return pending;
}

async function gmail<T>(token: string, path: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    if (quotaWait) await quotaWait;
    const r = await fetch(`${GMAIL}${path}`, { headers: { Authorization: "Bearer " + token } });
    if (r.status === 401) throw new GmailAuthError("Gmail sign-in expired.");
    if (r.ok) return r.json();
    const text = await r.text();
    const quota = r.status === 429 || (r.status === 403 && /rate|quota/i.test(text));
    if ((!quota && r.status < 500) || attempt >= RETRIES) {
      throw new Error(`Gmail ${r.status}: ${text.slice(0, 160)}`);
    }
    if (quota) await waitOutQuota();
    else await wait(1000 * 2 ** attempt);
  }
}

export async function gmailAddress(token: string): Promise<string> {
  const p = await gmail<{ emailAddress: string }>(token, "/profile");
  return p.emailAddress;
}

export async function listStoreMailIds(token: string, sinceSec: number): Promise<string[]> {
  const q = `{${SENDERS}} after:${Math.floor(sinceSec)}`;
  const ids: string[] = [];
  let page: string | undefined;
  do {
    const res = await gmail<{ messages?: { id: string }[]; nextPageToken?: string }>(
      token,
      `/messages?q=${encodeURIComponent(q)}&maxResults=100${page ? `&pageToken=${page}` : ""}`,
    );
    ids.push(...(res.messages ?? []).map((m) => m.id));
    page = res.nextPageToken;
  } while (page && ids.length < MAX_MESSAGES);
  return ids.slice(0, MAX_MESSAGES);
}

type Part = {
  mimeType?: string;
  body?: { data?: string };
  parts?: Part[];
  headers?: { name: string; value: string }[];
};

type Message = {
  id: string;
  threadId?: string;
  snippet?: string;
  internalDate?: string;
  payload?: Part;
};

function decodeBase64Url(data: string): string {
  const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function findPart(part: Part | undefined, mime: string): string | null {
  if (!part) return null;
  if (part.mimeType === mime && part.body?.data) return decodeBase64Url(part.body.data);
  for (const child of part.parts ?? []) {
    const found = findPart(child, mime);
    if (found) return found;
  }
  return null;
}

function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
}

function toInput(m: Message): MailInput {
  const headers = m.payload?.headers ?? [];
  const header = (name: string) =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
  const plain = findPart(m.payload, "text/plain");
  const html = plain ? null : findPart(m.payload, "text/html");
  const body = (plain ?? (html ? htmlToText(html) : ""))
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim()
    .slice(0, BODY_LIMIT);
  return {
    gmailId: m.id,
    threadId: m.threadId ?? null,
    from: header("From"),
    subject: header("Subject"),
    snippet: m.snippet ?? "",
    body,
    receivedAt: new Date(Number(m.internalDate) || Date.now()).toISOString(),
  };
}

export async function fetchStoreMails(
  token: string,
  ids: string[],
  onProgress?: (done: number) => void,
): Promise<MailInput[]> {
  const out: MailInput[] = [];
  let next = 0;
  let done = 0;
  let failed = false;
  const worker = async () => {
    while (!failed && next < ids.length) {
      const id = ids[next++];
      try {
        out.push(toInput(await gmail<Message>(token, `/messages/${id}?format=full`)));
      } catch (e) {
        failed = true;
        throw e;
      }
      if (!failed) onProgress?.(++done);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return out;
}
