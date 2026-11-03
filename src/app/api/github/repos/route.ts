import { getSession } from "@/lib/auth";
import { listRepos } from "@/lib/github";

/** Repos the server token can reach, optionally filtered by `q`. Signed-in only. */
export async function GET(req: Request) {
  if (!(await getSession())) return new Response("Sign in first.", { status: 401 });
  const q = new URL(req.url).searchParams.get("q") ?? "";
  try {
    return Response.json({ repos: await listRepos(q) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
