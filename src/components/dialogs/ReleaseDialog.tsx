"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/Modal";
import { Spinner } from "@/components/Spinner";
import { saveRelease } from "@/lib/actions";
import type { Release, TeamMember } from "@/lib/types";

export function ReleaseDialog({
  clientId,
  release,
  team,
  appCount = 0,
  trigger,
  className = "btn btn-secondary",
}: {
  clientId: string;
  release: Release;
  team: TeamMember[];
  appCount?: number;
  trigger: string;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(fd: FormData) {
    setError(null);
    start(async () => {
      const res = await saveRelease(fd);
      if (!res.ok) return setError(res.error);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button className={className} onClick={() => setOpen(true)}>
        {trigger}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Edit release"
        subtitle="A round of work for this client."
        width="max-w-lg"
      >
        <form action={submit}>
          <div className="space-y-3 px-5 py-4">
            <input type="hidden" name="id" defaultValue={release.id} />
            <input type="hidden" name="client_id" defaultValue={clientId} />

            <div>
              <label className="label" htmlFor="title">
                Title <span className="font-normal normal-case">(optional)</span>
              </label>
              <input
                id="title"
                name="title"
                defaultValue={release.title ?? ""}
                placeholder="Leave blank to label by date"
                className="field"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="assigned_to">
                  Assigned to
                </label>
                <select
                  id="assigned_to"
                  name="assigned_to"
                  defaultValue={release.assigned_to ?? ""}
                  className="field"
                >
                  <option value="">Unassigned</option>
                  {team.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="started_on">
                  Started on
                </label>
                <input
                  id="started_on"
                  name="started_on"
                  type="date"
                  defaultValue={release.started_on}
                  className="field"
                />
              </div>
            </div>

            {appCount > 0 && (
              <label className="flex cursor-pointer select-none items-start gap-2 rounded-md bg-muted/50 px-3 py-2 text-[13px] text-foreground/85">
                <input
                  type="checkbox"
                  name="cascade_assignee"
                  defaultChecked
                  className="mt-0.5 size-3.5 accent-foreground"
                />
                <span>
                  Also assign the {appCount} {appCount === 1 ? "app" : "apps"} in this release
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">
                    Uncheck to keep per-app assignments as they are.
                  </span>
                </span>
              </label>
            )}

            <div>
              <label className="label" htmlFor="release-note">
                Note
              </label>
              <textarea
                id="release-note"
                name="note"
                rows={2}
                defaultValue={release.note ?? ""}
                placeholder="What changed in this round."
                className="field resize-none"
              />
            </div>

            {error && (
              <p className="rounded-md bg-bad-soft px-2.5 py-2 text-[12px] text-bad">{error}</p>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" disabled={pending} className="btn btn-primary">
              {pending ? (
                <>
                  <Spinner /> Saving…
                </>
              ) : (
                "Save"
              )}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
