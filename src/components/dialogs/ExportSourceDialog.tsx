"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  ArrowUpIcon,
  CheckIcon,
  ChevronRightIcon,
  CloudUploadIcon,
  CopyIcon,
  ExternalLinkIcon,
  FolderIcon,
  FolderPlusIcon,
  GitBranchIcon,
  PlusIcon,
  RotateCwIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { Modal } from "@/components/Modal";
import { Spinner } from "@/components/Spinner";
import { writeToClipboard } from "@/components/CopyButton";
import {
  buildPath,
  driveCreateFolder,
  driveGetFile,
  driveListFolders,
  driveUpload,
  parseFolderId,
  requestToken,
  storedToken,
  timeAgo,
  type DriveFolder,
} from "@/lib/driveClient";

type Repo = { full: string; owner: string; name: string; def: string; priv: boolean; pushed: string | null };
type Branch = { name: string; date: string | null };
type Status = "pending" | "downloading" | "uploading" | "done" | "failed";
type QueueItem = {
  full: string;
  name: string;
  branch: string;
  status: Status;
  pct: number; // 0..1 within this item
  sizeMB?: string;
  error?: string;
};

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
const DEFAULT_FOLDER = parseFolderId(process.env.NEXT_PUBLIC_DRIVE_FOLDER_ID ?? "");

/** Folder listings cached by folder id for the session; cleared on manual refresh. */
const folderCache = new Map<string, DriveFolder[]>();

export function ExportSourceDialog({
  clientName,
  projects,
  className = "btn btn-secondary",
}: {
  clientName: string;
  projects: string[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        <CloudUploadIcon className="size-3.5" /> Export source
      </button>
      {open && (
        <ExportModal clientName={clientName} projects={projects} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function ExportModal({
  clientName,
  projects,
  onClose,
}: {
  clientName: string;
  projects: string[];
  onClose: () => void;
}) {
  const seed = (projects[0] || clientName || "").trim();
  const [repoQuery, setRepoQuery] = useState(seed);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [repo, setRepo] = useState<Repo | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchQuery, setBranchQuery] = useState("");
  const [branchSel, setBranchSel] = useState<Set<string>>(new Set());
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);

  const [gToken, setGToken] = useState<string | null>(null);
  const [folder, setFolder] = useState<DriveFolder | null>(null);
  const [browseOpen, setBrowseOpen] = useState(false);

  const [running, setRunning] = useState(false);
  const [doneLink, setDoneLink] = useState<string | null>(null);

  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function searchRepos(q: string) {
    setLoadingRepos(true);
    try {
      const r = await fetch(`/api/github/repos?q=${encodeURIComponent(q)}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `GitHub error ${r.status}`);
      setRepos(j.repos as Repo[]);
    } catch (e) {
      toast.error((e as Error).message);
      setRepos([]);
    } finally {
      setLoadingRepos(false);
    }
  }
  useEffect(() => {
    searchRepos(seed);
    const t = storedToken();
    if (t) {
      setGToken(t);
      if (DEFAULT_FOLDER) driveGetFile(t, DEFAULT_FOLDER).then(setFolder).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onRepoQuery(v: string) {
    setRepoQuery(v);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => searchRepos(v), 300);
  }

  async function pickRepo(r: Repo) {
    setRepo(r);
    setBranches([]);
    setBranchSel(new Set());
    setBranchQuery("");
    setLoadingBranches(true);
    try {
      const res = await fetch(`/api/github/branches?repo=${encodeURIComponent(r.full)}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `GitHub error ${res.status}`);
      setBranches(j.branches as Branch[]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoadingBranches(false);
    }
  }

  function toggleBranch(name: string) {
    setBranchSel((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }
  function addToQueue() {
    if (!repo || branchSel.size === 0) return;
    setQueue((q) => {
      const next = [...q];
      for (const br of branchSel) {
        if (!next.some((x) => x.full === repo.full && x.branch === br))
          next.push({ full: repo.full, name: repo.name, branch: br, status: "pending", pct: 0 });
      }
      return next;
    });
    setBranchSel(new Set());
    setBranchQuery("");
  }
  const setItem = (i: number, patch: Partial<QueueItem>) =>
    setQueue((q) => q.map((it, j) => (j === i ? { ...it, ...patch } : it)));

  async function connectGoogle() {
    if (!CLIENT_ID) return toast.error("NEXT_PUBLIC_GOOGLE_CLIENT_ID is not set.");
    try {
      const t = await requestToken(CLIENT_ID);
      setGToken(t);
      if (DEFAULT_FOLDER && !folder) {
        try {
          setFolder(await driveGetFile(t, DEFAULT_FOLDER));
        } catch {}
      }
    } catch (e) {
      toast.error("Google sign-in failed: " + (e as Error).message);
    }
  }

  async function downloadZip(i: number, it: QueueItem): Promise<Blob> {
    const r = await fetch(
      `/api/github/zip?repo=${encodeURIComponent(it.full)}&ref=${encodeURIComponent(it.branch)}`,
    );
    if (!r.ok) throw new Error((await r.text()) || `GitHub ${r.status}`);
    const total = Number(r.headers.get("Content-Length") || 0);
    if (!r.body) return r.blob();
    const reader = r.body.getReader();
    const chunks: Uint8Array[] = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      got += value.length;
      setItem(i, { status: "downloading", pct: total ? Math.min(got / total, 1) * 0.75 : 0.4 });
    }
    return new Blob(chunks as BlobPart[], { type: "application/zip" });
  }

  async function runExport() {
    if (!gToken || !folder || queue.length === 0) return;
    setRunning(true);
    setDoneLink(null);
    setQueue((q) => q.map((it) => ({ ...it, status: "pending", pct: 0, error: undefined, sizeMB: undefined })));
    const subName = `${clientName || "app"} — source code`;
    try {
      const sub = await driveCreateFolder(gToken, subName, folder.id);
      const link = sub.webViewLink || `https://drive.google.com/drive/folders/${sub.id}`;
      let ok = 0;
      for (let i = 0; i < queue.length; i++) {
        const it = queue[i];
        try {
          const blob = await downloadZip(i, it);
          setItem(i, { status: "uploading", pct: 0.85 });
          await driveUpload(gToken, `${it.name}-${it.branch.replace(/[\\/]/g, "-")}.zip`, blob, sub.id);
          setItem(i, { status: "done", pct: 1, sizeMB: (blob.size / 1048576).toFixed(1) });
          ok++;
        } catch (e) {
          setItem(i, { status: "failed", pct: 1, error: (e as Error).message });
        }
      }
      setDoneLink(link);
      ok === queue.length
        ? toast.success(`Exported ${ok}/${queue.length} to Drive`)
        : toast.warning(`Exported ${ok}/${queue.length} — some failed`);
    } catch (e) {
      toast.error("Export failed: " + (e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  const filteredBranches = branches.filter((b) =>
    b.name.toLowerCase().includes(branchQuery.trim().toLowerCase()),
  );
  const canExport = !!gToken && !!folder && queue.length > 0 && !running;

  // overall progress across the queue
  const processed = queue.filter((q) => q.status === "done" || q.status === "failed").length;
  const active = queue.find((q) => q.status === "downloading" || q.status === "uploading");
  const overall = queue.length ? Math.min(100, ((processed + (active?.pct ?? 0)) / queue.length) * 100) : 0;

  return (
    <>
      <Modal
        open
        onClose={running ? () => {} : onClose}
        title="Export source to Drive"
        subtitle="Zip repo branches and upload them to the team's Drive folder."
        width="max-w-wide"
      >
        <div className="grid md:h-[560px] md:grid-cols-2">
          {/* ---------------- LEFT: GitHub ---------------- */}
          <div className="flex min-h-0 flex-col gap-3 border-b p-5 md:border-b-0 md:border-r">
            <StepLabel n={1}>Choose a repository &amp; branches</StepLabel>

            {!repo ? (
              <>
                <div className="relative">
                  <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    className="field h-9 pl-9"
                    placeholder="Search 6amTech repositories…"
                    value={repoQuery}
                    onChange={(e) => onRepoQuery(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="min-h-0 flex-1 divide-y overflow-y-auto rounded-xl border">
                  {loadingRepos ? (
                    <div className="flex items-center gap-2 px-3 py-4 text-[12px] text-muted-foreground">
                      <Spinner /> Loading repositories…
                    </div>
                  ) : repos.length === 0 ? (
                    <div className="px-3 py-8 text-center text-[12px] text-muted-foreground">
                      No repositories match.
                    </div>
                  ) : (
                    repos.slice(0, 100).map((r) => (
                      <button
                        key={r.full}
                        type="button"
                        onClick={() => pickRepo(r)}
                        className="group flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted"
                      >
                        <span className="grid size-7 shrink-0 place-items-center rounded-lg border bg-background text-muted-foreground">
                          <GitBranchIcon className="size-3.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium">{r.name}</span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {r.owner} · updated {timeAgo(r.pushed)}
                          </span>
                        </span>
                        {r.priv && (
                          <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            Private
                          </span>
                        )}
                        <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                      </button>
                    ))
                  )}
                </div>
              </>
            ) : (
              <>
                {/* selected repo */}
                <div className="flex items-center gap-2.5 rounded-xl border bg-muted/30 px-3 py-2">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg border bg-background text-muted-foreground">
                    <GitBranchIcon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold">{repo.name}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{repo.owner}</span>
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost h-7 px-2 text-[12px]"
                    onClick={() => {
                      setRepo(null);
                      setBranches([]);
                    }}
                  >
                    Change
                  </button>
                </div>

                {loadingBranches ? (
                  <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                    <Spinner /> Loading branches…
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-medium text-foreground/80">
                        Branches <span className="text-muted-foreground">({branches.length})</span>
                      </span>
                      {branchSel.size > 0 && (
                        <span className="text-[11px] text-muted-foreground">{branchSel.size} selected</span>
                      )}
                    </div>
                    {branches.length > 6 && (
                      <div className="relative">
                        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <input
                          className="field h-9 pl-9"
                          placeholder="Search branches…"
                          value={branchQuery}
                          onChange={(e) => setBranchQuery(e.target.value)}
                        />
                      </div>
                    )}
                    <div className="min-h-0 flex-1 divide-y overflow-y-auto rounded-xl border">
                      {filteredBranches.map((b) => {
                        const on = branchSel.has(b.name);
                        return (
                          <label
                            key={b.name}
                            className={`flex cursor-pointer items-center gap-2.5 px-3 py-2 text-[13px] hover:bg-muted ${
                              on ? "bg-muted/60" : ""
                            }`}
                          >
                            <input
                              type="checkbox"
                              className="size-4 accent-primary"
                              checked={on}
                              onChange={() => toggleBranch(b.name)}
                            />
                            <span className="min-w-0 flex-1 truncate font-medium">{b.name}</span>
                            {b.name === repo.def && (
                              <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                default
                              </span>
                            )}
                            <span className="shrink-0 text-[11px] text-muted-foreground">
                              {timeAgo(b.date)}
                            </span>
                          </label>
                        );
                      })}
                      {filteredBranches.length === 0 && (
                        <div className="px-3 py-6 text-center text-[12px] text-muted-foreground">
                          No branches match.
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary h-9"
                      disabled={branchSel.size === 0}
                      onClick={addToQueue}
                    >
                      <PlusIcon className="size-4" />
                      Add {branchSel.size || ""} branch{branchSel.size === 1 ? "" : "es"} to list
                    </button>
                  </>
                )}
              </>
            )}
          </div>

          {/* ---------------- RIGHT: destination + queue ---------------- */}
          <div className="flex min-h-0 flex-col gap-4 p-5">
            {/* destination */}
            <div className="space-y-2">
              <StepLabel n={2}>Destination folder</StepLabel>
              {!gToken ? (
                <button type="button" className="btn btn-secondary h-8" onClick={connectGoogle}>
                  Sign in with Google
                </button>
              ) : (
                <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-[13px]">
                  <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 truncate">
                    {folder ? folder.name : "No folder"}
                    <span className="text-muted-foreground"> / {clientName || "app"} — source code</span>
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost ml-auto h-7 px-2 text-[12px]"
                    disabled={running}
                    onClick={() => setBrowseOpen(true)}
                  >
                    Change
                  </button>
                </div>
              )}
            </div>

            {/* queue + progress */}
            <div className="flex min-h-0 flex-1 flex-col gap-2">
              <StepLabel n={3}>
                Export list <span className="font-normal text-muted-foreground">({queue.length})</span>
              </StepLabel>

              {running && (
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-300"
                    style={{ width: `${overall}%` }}
                  />
                </div>
              )}

              <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
                {queue.length === 0 ? (
                  <div className="rounded-lg border border-dashed px-3 py-8 text-center text-[12px] text-muted-foreground">
                    Pick a repo and branches on the left, then add them here.
                  </div>
                ) : (
                  queue.map((q, i) => (
                    <div
                      key={q.full + q.branch}
                      className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[12px] ${
                        q.status === "done"
                          ? "border-good/40 bg-good/5"
                          : q.status === "failed"
                            ? "border-bad/40 bg-bad/5"
                            : "bg-muted/30"
                      }`}
                    >
                      <StatusDot status={q.status} />
                      <span className="min-w-0 truncate">
                        <span className="font-medium">{q.name}</span>
                        <span className="text-muted-foreground"> @ {q.branch}</span>
                      </span>
                      <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                        {q.status === "downloading"
                          ? `downloading ${Math.round((q.pct / 0.75) * 100)}%`
                          : q.status === "uploading"
                            ? "uploading…"
                            : q.status === "done"
                              ? `${q.sizeMB} MB`
                              : q.status === "failed"
                                ? "failed"
                                : ""}
                      </span>
                      {!running && (
                        <button
                          type="button"
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => setQueue((list) => list.filter((_, j) => j !== i))}
                          aria-label="Remove"
                        >
                          <XIcon className="size-3.5" />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>

              {doneLink && (
                <div className="space-y-2 rounded-lg border border-good/40 bg-good/5 p-2.5">
                  <div className="flex items-center gap-1.5 text-[12px] font-medium text-good">
                    <CheckIcon className="size-3.5" strokeWidth={3} /> Uploaded to Drive
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      readOnly
                      value={doneLink}
                      onFocus={(e) => e.currentTarget.select()}
                      className="field h-8 flex-1 text-[12px]"
                    />
                    <button
                      type="button"
                      className="btn btn-secondary size-8 shrink-0 p-0"
                      title="Copy link"
                      onClick={async () => {
                        (await writeToClipboard(doneLink))
                          ? toast.success("Link copied")
                          : toast.error("Could not copy");
                      }}
                    >
                      <CopyIcon className="size-3.5" />
                    </button>
                    <a
                      href={doneLink}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-secondary size-8 shrink-0 p-0"
                      title="Open in Drive"
                    >
                      <ExternalLinkIcon className="size-3.5" />
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* footer */}
        <div className="flex items-center gap-2 border-t px-5 py-3">
          <p className="text-[12px] text-muted-foreground">
            {queue.length} item{queue.length === 1 ? "" : "s"} queued
          </p>
          <div className="ml-auto flex gap-2">
            <button type="button" className="btn btn-secondary h-8" disabled={running} onClick={onClose}>
              Close
            </button>
            <button type="button" className="btn btn-primary h-8" disabled={!canExport} onClick={runExport}>
              {running ? <Spinner /> : <CloudUploadIcon className="size-3.5" />}
              {running ? "Exporting…" : "Export to Drive"}
            </button>
          </div>
        </div>
      </Modal>

      {browseOpen && gToken && (
        <FolderBrowser
          token={gToken}
          startId={folder?.id || DEFAULT_FOLDER || "root"}
          onPick={(f) => {
            setFolder(f);
            setBrowseOpen(false);
          }}
          onClose={() => setBrowseOpen(false)}
        />
      )}
    </>
  );
}

function StepLabel({ n, children }: { n: number; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-[12px] font-semibold text-foreground/80">
      <span className="grid size-5 place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
        {n}
      </span>
      {children}
    </div>
  );
}

function StatusDot({ status }: { status: Status }) {
  if (status === "downloading" || status === "uploading") return <Spinner />;
  if (status === "done")
    return <CheckIcon className="size-3.5 shrink-0 text-good" strokeWidth={3} />;
  if (status === "failed") return <XIcon className="size-3.5 shrink-0 text-bad" strokeWidth={3} />;
  return <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground/40" />;
}

/** File-manager style folder browser: breadcrumb, search, icon grid. */
function FolderBrowser({
  token,
  startId,
  onPick,
  onClose,
}: {
  token: string;
  startId: string;
  onPick: (f: DriveFolder) => void;
  onClose: () => void;
}) {
  const [nav, setNav] = useState<DriveFolder[]>([{ id: "root", name: "My Drive" }]);
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<DriveFolder | null>(null);
  const [busy, setBusy] = useState(false);

  async function load(stack: DriveFolder[], force = false) {
    setNav(stack);
    setQ("");
    setSel(null);
    const id = stack[stack.length - 1].id;
    const cached = folderCache.get(id);
    if (cached && !force) {
      setFolders(cached);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await driveListFolders(token, id);
      folderCache.set(id, list);
      setFolders(list);
    } catch (e) {
      toast.error((e as Error).message);
      setFolders([]);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    (async () => {
      try {
        const stack =
          startId && startId !== "root"
            ? await buildPath(token, startId)
            : [{ id: "root", name: "My Drive" }];
        await load(stack);
      } catch {
        await load([{ id: "root", name: "My Drive" }]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cur = nav[nav.length - 1];
  const target = sel ?? cur;
  const shown = folders.filter((f) => f.name.toLowerCase().includes(q.trim().toLowerCase()));

  async function newFolder() {
    const name = prompt("New folder name:");
    if (!name?.trim()) return;
    setBusy(true);
    try {
      const f = await driveCreateFolder(token, name.trim(), cur.id);
      folderCache.delete(cur.id); // the parent listing is now stale
      await load([...nav, { id: f.id, name: f.name }]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Choose destination folder" width="max-w-4xl">
      {/* toolbar */}
      <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-2.5">
        <button
          type="button"
          className="btn btn-secondary size-8 shrink-0 p-0"
          disabled={nav.length <= 1}
          onClick={() => load(nav.slice(0, -1))}
          title="Up one level"
        >
          <ArrowUpIcon className="size-4" />
        </button>
        <button
          type="button"
          className="btn btn-secondary size-8 shrink-0 p-0"
          disabled={loading}
          onClick={() => load(nav, true)}
          title="Refresh this folder"
        >
          <RotateCwIcon className={`size-4 ${loading ? "animate-spin" : ""}`} />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto rounded-lg border bg-background px-2 py-1.5 text-[12px]">
          {nav.map((n, i) => (
            <span key={n.id + i} className="flex shrink-0 items-center">
              <button
                type="button"
                className={`rounded px-1.5 py-0.5 hover:bg-muted ${
                  i === nav.length - 1 ? "font-semibold" : "text-muted-foreground"
                }`}
                onClick={() => load(nav.slice(0, i + 1))}
              >
                {n.name}
              </button>
              {i < nav.length - 1 && <ChevronRightIcon className="size-3 text-muted-foreground" />}
            </span>
          ))}
        </div>
        <div className="relative w-44 shrink-0">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            className="field h-8 pl-8"
            placeholder="Search…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      {/* grid — fixed height so the dialog never resizes as you navigate */}
      <div className="h-[460px] overflow-y-auto p-3">
        {loading ? (
          <div className="flex items-center gap-2 px-2 py-6 text-[12px] text-muted-foreground">
            <Spinner /> Loading…
          </div>
        ) : shown.length === 0 ? (
          <div className="px-2 py-10 text-center text-[12px] text-muted-foreground">
            No sub-folders here.
            <br />
            Use this folder below, or create a new one.
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-1">
            {shown.map((f) => {
              const on = sel?.id === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setSel(f)}
                  onDoubleClick={() => load([...nav, f])}
                  className={`flex flex-col items-center gap-2 rounded-xl border p-3 text-center transition-colors ${
                    on ? "border-ring bg-muted" : "border-transparent hover:bg-muted"
                  }`}
                  title={f.name}
                >
                  <FolderIcon className="size-9 text-primary/80" />
                  <span className="line-clamp-2 w-full break-words text-[12px] leading-tight">
                    {f.name}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* footer */}
      <div className="flex items-center gap-2 border-t px-5 py-3">
        <button type="button" className="btn btn-ghost h-8 text-[12px]" onClick={newFolder} disabled={busy}>
          <FolderPlusIcon className="size-3.5" /> New folder
        </button>
        <span className="ml-2 min-w-0 truncate text-[12px] text-muted-foreground">
          Selected: <span className="font-medium text-foreground">{target.name}</span>
        </span>
        <div className="ml-auto flex gap-2">
          <button type="button" className="btn btn-secondary h-8" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary h-8" onClick={() => onPick(target)}>
            Use “{target.name}”
          </button>
        </div>
      </div>
    </Modal>
  );
}
