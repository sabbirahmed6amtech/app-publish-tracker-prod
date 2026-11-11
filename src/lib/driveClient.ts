"use client";

/**
 * Browser-side Google Drive for the Source-to-Drive export. Each developer
 * signs in with their own Google account and uploads into the team's shared
 * folder. Nothing Google-related touches the server.
 */

const DRIVE = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const SCOPE = "https://www.googleapis.com/auth/drive";
const TOK_KEY = "apt_gtok";
const EXP_KEY = "apt_gexp";

export type DriveFolder = { id: string; name: string };

// ---- Google Identity Services (token) ----
let gisPromise: Promise<void> | null = null;
export function loadGis(): Promise<void> {
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    if ((window as unknown as { google?: { accounts?: unknown } }).google?.accounts) return resolve();
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load Google sign-in."));
    document.head.appendChild(s);
  });
  return gisPromise;
}

type TokenResp = { access_token?: string; expires_in?: number; error?: string };

/** Reuse a still-valid token from this browser, else null. */
export function storedToken(): string | null {
  try {
    const t = localStorage.getItem(TOK_KEY);
    const e = Number(localStorage.getItem(EXP_KEY));
    return t && e && Date.now() < e ? t : null;
  } catch {
    return null;
  }
}
function saveToken(tok: string, expiresInSec: number) {
  try {
    localStorage.setItem(TOK_KEY, tok);
    localStorage.setItem(EXP_KEY, String(Date.now() + expiresInSec * 1000 - 60_000));
  } catch {}
}

/** Request a Drive access token. `silent` tries without a popup first. */
export async function requestToken(clientId: string, silent = false): Promise<string> {
  await loadGis();
  const google = (window as unknown as { google: any }).google; // eslint-disable-line @typescript-eslint/no-explicit-any
  return new Promise<string>((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (resp: TokenResp) => {
        if (resp.error || !resp.access_token) return reject(new Error(resp.error || "No token"));
        saveToken(resp.access_token, Number(resp.expires_in) || 3600);
        resolve(resp.access_token);
      },
    });
    try {
      client.requestAccessToken({ prompt: silent ? "" : undefined });
    } catch (e) {
      reject(e as Error);
    }
  });
}

// ---- Drive REST (with the user's token) ----
function auth(token: string) {
  return { Authorization: "Bearer " + token };
}

export async function driveGetFile(token: string, id: string): Promise<DriveFolder> {
  const r = await fetch(`${DRIVE}/files/${id}?fields=id,name&supportsAllDrives=true`, {
    headers: auth(token),
  });
  if (!r.ok) throw new Error(`Drive ${r.status}`);
  return r.json();
}

export async function driveListFolders(token: string, parentId: string): Promise<DriveFolder[]> {
  const q = `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const url =
    `${DRIVE}/files?q=${encodeURIComponent(q)}&fields=files(id,name)` +
    `&orderBy=name_natural&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true`;
  const r = await fetch(url, { headers: auth(token) });
  if (!r.ok) throw new Error(`Drive ${r.status}: ${(await r.text()).slice(0, 160)}`);
  return (await r.json()).files ?? [];
}

export async function driveCreateFolder(
  token: string,
  name: string,
  parentId: string,
): Promise<DriveFolder & { webViewLink?: string }> {
  const r = await fetch(`${DRIVE}/files?fields=id,name,webViewLink&supportsAllDrives=true`, {
    method: "POST",
    headers: { ...auth(token), "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }),
  });
  if (!r.ok) throw new Error(`Drive folder create ${r.status}: ${(await r.text()).slice(0, 160)}`);
  return r.json();
}

/** Resumable upload so large zips are fine. Returns the created file. */
export async function driveUpload(
  token: string,
  name: string,
  blob: Blob,
  parentId: string,
): Promise<{ id: string; webViewLink?: string }> {
  const start = await fetch(
    `${UPLOAD}/files?uploadType=resumable&fields=id,webViewLink&supportsAllDrives=true`,
    {
      method: "POST",
      headers: {
        ...auth(token),
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": "application/zip",
        "X-Upload-Content-Length": String(blob.size),
      },
      body: JSON.stringify({ name, parents: [parentId] }),
    },
  );
  if (!start.ok) throw new Error(`Drive upload start ${start.status}: ${(await start.text()).slice(0, 160)}`);
  const session = start.headers.get("Location");
  if (!session) throw new Error("Drive gave no upload URL (check Client ID / origin).");
  const put = await fetch(session, {
    method: "PUT",
    headers: { "Content-Type": "application/zip" },
    body: blob,
  });
  if (!put.ok) throw new Error(`Drive upload ${put.status}: ${(await put.text()).slice(0, 160)}`);
  return put.json();
}

/** Breadcrumb [My Drive … folder] by walking parents. */
export async function buildPath(token: string, id: string): Promise<DriveFolder[]> {
  let rootId = "";
  try {
    const r = await fetch(`${DRIVE}/files/root?fields=id`, { headers: auth(token) });
    if (r.ok) rootId = (await r.json()).id;
  } catch {}
  const chain: DriveFolder[] = [];
  let cur: string | null = id;
  for (let guard = 0; cur && cur !== "root" && cur !== rootId && guard < 25; guard++) {
    const r = await fetch(`${DRIVE}/files/${cur}?fields=id,name,parents&supportsAllDrives=true`, {
      headers: auth(token),
    });
    if (!r.ok) break;
    const f = (await r.json()) as { id: string; name: string; parents?: string[] };
    chain.unshift({ id: f.id, name: f.name });
    cur = f.parents?.[0] ?? null;
  }
  return [{ id: "root", name: "My Drive" }, ...chain];
}

/** Accept a Drive folder link or a bare ID; return the ID. */
export function parseFolderId(s: string): string {
  if (!s) return "";
  const m = s.match(/\/folders\/([a-zA-Z0-9_-]+)/) || s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  return /^[a-zA-Z0-9_-]{10,}$/.test(s.trim()) ? s.trim() : "";
}

export function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - Date.parse(iso);
  if (!(diff >= 0)) return "";
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}
