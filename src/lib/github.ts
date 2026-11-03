/**
 * Server-side GitHub access for the Source-to-Drive export. One org token
 * (GITHUB_TOKEN) does the talking, so team members never handle a token.
 *
 * Why the zip is fetched here and not in the browser: GitHub's zip lives on
 * codeload.github.com, which blocks cross-origin browser reads. The server has
 * no such limit, so it follows the redirect and streams the archive through.
 */

const API = "https://api.github.com";

function token(): string {
  const t = process.env.GITHUB_TOKEN;
  if (!t) throw new Error("GITHUB_TOKEN is not set on the server.");
  return t;
}
function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${token()}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "app-publish-tracker",
  };
}

async function ghJson<T = unknown>(path: string): Promise<T> {
  const r = await fetch(API + path, { headers: headers() });
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json() as Promise<T>;
}
async function ghAll<T = unknown>(path: string): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= 20; page++) {
    const sep = path.includes("?") ? "&" : "?";
    const arr = await ghJson<T[]>(`${path}${sep}per_page=100&page=${page}`);
    out.push(...arr);
    if (arr.length < 100) break;
  }
  return out;
}
async function ghGraphQL<T = unknown>(query: string, variables: unknown): Promise<T> {
  const r = await fetch(`${API}/graphql`, {
    method: "POST",
    headers: { ...headers(), "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!r.ok) throw new Error(`GitHub GraphQL ${r.status}`);
  const j = (await r.json()) as { data?: T; errors?: { message: string }[] };
  if (j.errors?.length) throw new Error(j.errors[0].message);
  return j.data as T;
}

export type RepoLite = {
  full: string;
  owner: string;
  name: string;
  def: string;
  priv: boolean;
  pushed: string | null;
};
export type BranchLite = { name: string; date: string | null };

type RefsResp = {
  repository: {
    refs: {
      nodes: { name: string; target: { committedDate?: string } | null }[];
      pageInfo: { hasNextPage: boolean; endCursor: string };
    };
  } | null;
};

/**
 * Repos the export can offer, newest-pushed first. Scoped to GITHUB_ORG when
 * set (e.g. 6amTech) so only that org's repos show; otherwise falls back to
 * everything the token can reach.
 */
export async function listRepos(q?: string): Promise<RepoLite[]> {
  const org = process.env.GITHUB_ORG?.trim();
  const map = new Map<string, Record<string, unknown>>();
  const add = (arr: Record<string, unknown>[]) =>
    arr.forEach((r) => map.set(r.full_name as string, r));

  if (org) {
    add(await ghAll(`/orgs/${org}/repos?type=all&sort=pushed`));
  } else {
    try {
      add(await ghAll("/user/repos?affiliation=owner,collaborator,organization_member&sort=pushed"));
    } catch {}
    try {
      const orgs = await ghAll<{ login: string }>("/user/orgs");
      for (const o of orgs) {
        try {
          add(await ghAll(`/orgs/${o.login}/repos?type=all&sort=pushed`));
        } catch {}
      }
    } catch {}
  }

  let repos: RepoLite[] = [...map.values()].map((r) => ({
    full: r.full_name as string,
    owner: (r.owner as { login: string }).login,
    name: r.name as string,
    def: (r.default_branch as string) || "main",
    priv: Boolean(r.private),
    pushed: (r.pushed_at as string) || null,
  }));
  if (q) {
    const f = q.toLowerCase();
    repos = repos.filter((r) => r.full.toLowerCase().includes(f));
  }
  repos.sort((a, b) => (Date.parse(b.pushed || "") || 0) - (Date.parse(a.pushed || "") || 0));
  return repos.slice(0, 500);
}

/** Branches with their last-commit date (one GraphQL call), newest first. */
export async function listBranches(repo: string): Promise<BranchLite[]> {
  const [owner, name] = repo.split("/");
  if (!owner || !name) throw new Error("Expected repo as owner/name.");
  try {
    const Q = `query($owner:String!,$name:String!,$cursor:String){
      repository(owner:$owner,name:$name){
        refs(refPrefix:"refs/heads/",first:100,after:$cursor,orderBy:{field:TAG_COMMIT_DATE,direction:DESC}){
          nodes{ name target{ ... on Commit { committedDate } } }
          pageInfo{ hasNextPage endCursor }
        }
      }
    }`;
    const out: BranchLite[] = [];
    let cursor: string | null = null;
    for (let guard = 0; guard < 10; guard++) {
      const d = (await ghGraphQL(Q, { owner, name, cursor })) as RefsResp;
      const refs = d.repository?.refs;
      if (!refs) break;
      out.push(
        ...refs.nodes.map((n) => ({ name: n.name, date: n.target?.committedDate ?? null })),
      );
      if (!refs.pageInfo.hasNextPage) break;
      cursor = refs.pageInfo.endCursor;
    }
    return out;
  } catch {
    const branches = await ghAll<{ name: string }>(`/repos/${repo}/branches`);
    return branches.map((b) => ({ name: b.name, date: null }));
  }
}

/** A streaming Response for the branch's source zip. Caller pipes `.body`. */
export async function zipResponse(repo: string, ref: string): Promise<Response> {
  const first = await fetch(`${API}/repos/${repo}/zipball/${encodeURIComponent(ref)}`, {
    headers: headers(),
    redirect: "manual",
  });
  const loc = first.headers.get("location");
  if (!loc) {
    if (first.ok) return first;
    throw new Error(`GitHub ${first.status}: ${(await first.text()).slice(0, 200)}`);
  }
  const archive = await fetch(loc, { headers: { "User-Agent": "app-publish-tracker" } });
  if (!archive.ok) throw new Error(`codeload ${archive.status}`);
  return archive;
}
