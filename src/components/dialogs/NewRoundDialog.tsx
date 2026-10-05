"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/Modal";
import { Spinner } from "@/components/Spinner";
import { ProjectLogo } from "@/components/ProjectLogo";
import { StoreIcon } from "@/components/StoreIcon";
import { createRound } from "@/lib/actions";
import type { LineBadge, Platform, TeamMember } from "@/lib/types";

export type RoundApp = {
  id: string;
  name: string;
  project: string;
  platform: Platform;
  badge?: LineBadge;
};

export function NewRoundDialog({
  clientId,
  apps,
  team,
  trigger = "New release",
  className = "btn btn-primary",
  defaultOpen = false,
}: {
  clientId: string;
  apps: RoundApp[];
  team: TeamMember[];
  trigger?: string;
  className?: string;
  defaultOpen?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(apps.map((a) => a.id)));
  const [title, setTitle] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [startedOn, setStartedOn] = useState(() => new Date().toISOString().slice(0, 10));

  const allOn = selected.size === apps.length && apps.length > 0;

  function reset() {
    setError(null);
    setSelected(new Set(apps.map((a) => a.id)));
    setTitle("");
    setAssignedTo("");
    setStartedOn(new Date().toISOString().slice(0, 10));
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submit() {
    setError(null);
    if (selected.size === 0) {
      setError("Pick at least one app for this round.");
      return;
    }
    const fd = new FormData();
    fd.set("client_id", clientId);
    fd.set("title", title);
    fd.set("assigned_to", assignedTo);
    fd.set("started_on", startedOn);
    for (const id of selected) fd.append("products", id);

    start(async () => {
      const res = await createRound(fd);
      if (!res.ok) return setError(res.error);
      setOpen(false);
      if (res.id) router.push(`/releases/${res.id}`);
      router.refresh();
    });
  }

  const ordered = useMemo(() => apps, [apps]);

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        {trigger}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New release"
        subtitle="A round of work. Pick the apps it covers; leave it untitled to label it by date."
        width="max-w-lg"
      >
        <div className="space-y-4 px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="round-title">
                Title <span className="font-normal normal-case">(optional)</span>
              </label>
              <input
                id="round-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Vendor update — leave blank to use the date"
                className="field"
              />
            </div>
            <div>
              <label className="label" htmlFor="round-assignee">
                Assigned to
              </label>
              <select
                id="round-assignee"
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="field"
              >
                <option value="">You</option>
                {team.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="round-date">
                Started on
              </label>
              <input
                id="round-date"
                type="date"
                value={startedOn}
                onChange={(e) => setStartedOn(e.target.value)}
                className="field"
              />
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="label mb-0">
                Apps in this round{" "}
                <span className="font-normal text-muted-foreground">
                  ({selected.size}/{apps.length})
                </span>
              </label>
              {apps.length > 0 && (
                <button
                  type="button"
                  className="text-[12px] font-medium text-foreground/70 hover:text-foreground"
                  onClick={() =>
                    setSelected(allOn ? new Set() : new Set(apps.map((a) => a.id)))
                  }
                >
                  {allOn ? "Clear all" : "Select all"}
                </button>
              )}
            </div>

            {apps.length === 0 ? (
              <p className="rounded-md border bg-muted/40 px-3 py-4 text-center text-[13px] text-muted-foreground">
                This client has no active apps. Add apps first.
              </p>
            ) : (
              <ul className="max-h-[280px] space-y-1 overflow-y-auto rounded-md border p-1.5">
                {ordered.map((a) => (
                  <li key={a.id}>
                    <label className="flex cursor-pointer select-none items-center gap-2.5 rounded px-2 py-1.5 hover:bg-muted/50">
                      <input
                        type="checkbox"
                        checked={selected.has(a.id)}
                        onChange={() => toggle(a.id)}
                        className="size-4 accent-foreground"
                      />
                      <ProjectLogo badge={a.badge} project={a.project} />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                        {a.name}
                      </span>
                      <StoreIcon platform={a.platform} size={14} />
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {error && (
            <p className="rounded-md bg-bad-soft px-2.5 py-2 text-[12px] text-bad">{error}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t px-5 py-3">
          <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button
            type="button"
            disabled={pending || selected.size === 0}
            onClick={submit}
            className="btn btn-primary"
          >
            {pending ? (
              <>
                <Spinner /> Starting…
              </>
            ) : (
              "Start release"
            )}
          </button>
        </div>
      </Modal>
    </>
  );
}
