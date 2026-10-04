import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * What a client's public website can tell us about their business, read off the
 * page they paste into the intake form. Everything here is a best guess for the
 * client to check — never saved on its own.
 */
export type Prefill = {
  website: string; // the normalised URL we actually fetched
  name?: string;
  email?: string;
  phone?: string;
  privacy?: string;
  deleteAccount?: string;
  support?: string;
};

const FETCH_TIMEOUT_MS = 8000;
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB of HTML is plenty for the <head> and footer.

/** Turn "yourcompany.com" or "http://…" into a validated https(ish) URL. */
function normalise(input: string): URL | null {
  const raw = input.trim();
  if (!raw) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

/** Block addresses that point back at our own network (SSRF guard). */
function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    return v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v === "::";
  }
  const [a, b] = ip.split(".").map(Number);
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true; // link-local
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

async function assertPublicHost(hostname: string): Promise<boolean> {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return false;
  try {
    const results = await lookup(host, { all: true });
    return results.length > 0 && results.every((r) => !isPrivateAddress(r.address));
  } catch {
    return false;
  }
}

function resolve(base: URL, href: string | undefined): string | undefined {
  if (!href) return undefined;
  try {
    return new URL(href, base).toString();
  } catch {
    return undefined;
  }
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

/** Flatten a JSON-LD blob (it may be a @graph, an array, or one object). */
function ldNodes(data: unknown): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const visit = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      out.push(o);
      if (Array.isArray(o["@graph"])) (o["@graph"] as unknown[]).forEach(visit);
    }
  };
  visit(data);
  return out;
}

const firstString = (v: unknown): string | undefined =>
  typeof v === "string" ? v : Array.isArray(v) ? firstString(v[0]) : undefined;

/** Read a business's details out of a page's HTML. */
function parse(html: string, base: URL): Prefill {
  const out: Prefill = { website: `${base.protocol}//${base.host}/` };

  // 1. Structured data (schema.org JSON-LD) — the richest source when present.
  const scripts = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const m of scripts) {
    let data: unknown;
    try {
      data = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    for (const node of ldNodes(data)) {
      const type = String(node["@type"] ?? "").toLowerCase();
      if (!out.name && (type.includes("organization") || type.includes("localbusiness"))) {
        out.name = firstString(node.name) ? decode(firstString(node.name)!) : out.name;
      }
      if (!out.email) {
        const email = firstString(node.email);
        if (email) out.email = email.replace(/^mailto:/i, "").trim();
      }
      if (!out.phone) {
        const phone = firstString(node.telephone);
        const cp = node.contactPoint as Record<string, unknown> | undefined;
        out.phone = (phone || firstString(cp?.telephone))?.trim() || out.phone;
      }
    }
  }

  // 2. Meta tags, as a fallback for the business name.
  if (!out.name) {
    const og = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i);
    if (og) out.name = decode(og[1]);
  }

  // 3. Links in the page — match a privacy / contact / support / delete page.
  const links: { href: string; text: string }[] = [];
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = m[1];
    const label = decode(m[2].replace(/<[^>]+>/g, " ")).toLowerCase();
    if (href && !href.startsWith("#") && !href.startsWith("javascript:")) {
      links.push({ href, text: `${label} ${href.toLowerCase()}` });
    }
  }
  const find = (re: RegExp) => resolve(base, links.find((l) => re.test(l.text))?.href);

  out.privacy = find(/privacy|confidential|politique.*confidential/) ?? `${base.protocol}//${base.host}/privacy-policy`;
  const contact = find(/contact|support|help|aide/);
  out.support = contact ?? `${base.protocol}//${base.host}/contact-us`;
  out.deleteAccount = find(/delete.*account|account.*delet|supprim.*compte|data.*delet/) ?? out.support;

  // Don't surface an email pulled from somewhere odd; keep only plausible ones.
  if (out.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(out.email)) delete out.email;
  return out;
}

/**
 * Fetch a client's website and read what we can off it. Returns the fields for
 * the intake form to pre-fill, or an error the client can act on. Safe to call
 * from a public form: it refuses non-public hosts and caps time and size.
 */
export async function prefillFromWebsite(
  input: string,
): Promise<{ ok: true; data: Prefill } | { ok: false; error: string }> {
  const url = normalise(input);
  if (!url) return { ok: false, error: "That doesn't look like a web address." };
  if (!(await assertPublicHost(url.hostname))) {
    return { ok: false, error: "We couldn't reach that website." };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; PublishTracker/1.0; +intake-autofill)",
        accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) return { ok: false, error: `The website returned an error (${res.status}).` };
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("html")) return { ok: false, error: "That link isn't a web page we can read." };

    // Read at most MAX_BYTES so a huge page can't tie us up.
    const reader = res.body?.getReader();
    if (!reader) return { ok: false, error: "We couldn't read that website." };
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        size += value.length;
        if (size >= MAX_BYTES) {
          await reader.cancel();
          break;
        }
      }
    }
    const html = Buffer.concat(chunks).toString("utf8");
    const finalUrl = new URL(res.url || url.toString());
    return { ok: true, data: parse(html, finalUrl) };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      return { ok: false, error: "The website took too long to respond." };
    }
    return { ok: false, error: "We couldn't reach that website." };
  } finally {
    clearTimeout(timer);
  }
}
