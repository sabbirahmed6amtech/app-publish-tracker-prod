import { getSession } from "@/lib/auth";
import { listBranches } from "@/lib/github";

/** A repo's branches with last-commit dates. `?repo=owner/name`. Signed-in only. */
export async function GET(req: Request) {
  if (!(await getSession())) return new Response("Sign in first.", { status: 401 });
  const repo = new URL(req.url).searchParams.get("repo") ?? "";
  if (!repo.includes("/")) return Response.json({ error: "Expected ?repo=owner/name" }, { status: 400 });
  try {
    return Response.json({ branches: await listBranches(repo) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
