import { getSession } from "@/lib/auth";
import { zipResponse } from "@/lib/github";

// Large repos take a while to stream through.
export const runtime = "nodejs";
export const maxDuration = 300;

/** Streams a branch's source zip. `?repo=owner/name&ref=branch`. Signed-in only. */
export async function GET(req: Request) {
  if (!(await getSession())) return new Response("Sign in first.", { status: 401 });
  const url = new URL(req.url);
  const repo = url.searchParams.get("repo") ?? "";
  const ref = url.searchParams.get("ref") ?? "";
  if (!repo.includes("/") || !ref) return new Response("Missing repo/ref", { status: 400 });

  try {
    const archive = await zipResponse(repo, ref);
    const name = `${repo.split("/")[1]}-${ref.replace(/[\\/]/g, "-")}.zip`;
    const headers: Record<string, string> = {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
    };
    const len = archive.headers.get("content-length");
    if (len) headers["Content-Length"] = len;
    return new Response(archive.body, { headers });
  } catch (e) {
    return new Response((e as Error).message, { status: 502 });
  }
}
