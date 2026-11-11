import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Stored files, in the Supabase Storage bucket named after their kind when
 * Supabase is configured, otherwise on disk under UPLOAD_DIR (default ./uploads):
 *   jks/    keystore files — private, downloaded only by signed-in team members
 *   logos/  product-line logos — public, shown on the tracker and the client form
 * Paths stored in the database are relative to their folder.
 */
export type UploadKind = "jks" | "logos";

const ROOT = path.resolve(process.env.UPLOAD_DIR || "./uploads");

const globalForStorage = globalThis as unknown as { supabaseStorage?: SupabaseClient | null };

function storage(): SupabaseClient | null {
  if (globalForStorage.supabaseStorage !== undefined) return globalForStorage.supabaseStorage;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  globalForStorage.supabaseStorage =
    url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  return globalForStorage.supabaseStorage;
}

function objectKey(relative: string): string {
  const clean = path.posix.normalize(relative.replace(/\\/g, "/"));
  if (clean.startsWith("..") || clean.startsWith("/") || clean === ".") throw new Error("Bad file path.");
  return clean;
}

/** The absolute path of a stored file; refuses anything that leaves its folder. */
export function uploadPath(kind: UploadKind, relative: string): string {
  const base = path.join(ROOT, kind);
  const full = path.resolve(base, relative);
  if (full !== base && !full.startsWith(base + path.sep)) throw new Error("Bad file path.");
  return full;
}

/** A file name safe to keep on disk. */
export const safeFileName = (name: string) => name.replace(/[^\w.\-]+/g, "_").slice(-120) || "file";

export async function saveUpload(kind: UploadKind, relative: string, file: File): Promise<void> {
  const client = storage();
  if (client) {
    const { error } = await client.storage
      .from(kind)
      .upload(objectKey(relative), Buffer.from(await file.arrayBuffer()), {
        contentType: file.type || "application/octet-stream",
        upsert: true,
      });
    if (error) throw new Error(`Could not store the file: ${error.message}`);
    return;
  }
  const full = uploadPath(kind, relative);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, Buffer.from(await file.arrayBuffer()));
}

export async function readUpload(kind: UploadKind, relative: string): Promise<Buffer | null> {
  try {
    const client = storage();
    if (client) {
      const { data, error } = await client.storage.from(kind).download(objectKey(relative));
      if (error || !data) return null;
      return Buffer.from(await data.arrayBuffer());
    }
    return await readFile(uploadPath(kind, relative));
  } catch {
    return null;
  }
}

/** Remove a stored file; a file that's already gone is fine. */
export async function removeUpload(kind: UploadKind, relative: string | null | undefined) {
  if (!relative) return;
  try {
    const client = storage();
    if (client) {
      await client.storage.from(kind).remove([objectKey(relative)]);
      return;
    }
    await rm(uploadPath(kind, relative), { force: true });
  } catch {
    // Not worth failing the action over.
  }
}

/** The public address of a product-line logo. */
export const logoUrl = (logoPath: string | null) =>
  logoPath ? `/uploads/logos/${logoPath.split("/").map(encodeURIComponent).join("/")}` : null;
