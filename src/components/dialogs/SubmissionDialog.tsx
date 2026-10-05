"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PencilIcon } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/Modal";
import { Spinner } from "@/components/Spinner";
import { saveApp } from "@/lib/actions";
import { PLATFORMS, STATUSES, STATUS_ORDER } from "@/lib/constants";
import type { App, Platform, TeamMember } from "@/lib/types";

/**
 * Edit one app's submission in a release. Only the per-release facts live here;
 * the app's name, store, keystore and link are edited once on the app itself.
 */
export function SubmissionDialog({
  app,
  platform,
  clientId,
  team,
}: {
  app: App;
  platform: Platform;
  clientId: string;
  team: TeamMember[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(fd: FormData) {
    setError(null);
    start(async () => {
      const res = await saveApp(fd);
      if (!res.ok) return setError(res.error);
      toast.success("Saved");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost size-7 px-0"
        aria-label="Edit submission"
        title="Edit submission"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        <PencilIcon className="size-3.5" />
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={app.app_name || app.project_name}
        subtitle={`${PLATFORMS[platform].label} · ${app.project_name}`}
        width="max-w-lg"
      >
        <form action={submit}>
          <div className="space-y-3 px-5 py-4">
            <input type="hidden" name="id" value={app.id} />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="sub-status">
                  Status
                </label>
                <select id="sub-status" name="status" defaultValue={app.status} className="field">
                  {STATUS_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {STATUSES[s].label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="sub-assignee">
                  Assigned to
                </label>
                <select
                  id="sub-assignee"
                  name="assigned_to"
                  defaultValue={app.assigned_to ?? ""}
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
                <label className="label" htmlFor="sub-build">
                  Build version
                </label>
                <input
                  id="sub-build"
                  name="build_version"
                  defaultValue={app.build_version ?? ""}
                  placeholder="1.0.6+9"
                  className="field font-mono"
                />
              </div>
              <div>
                <label className="label" htmlFor="sub-flutter">
                  Flutter version
                </label>
                <input
                  id="sub-flutter"
                  name="flutter_version"
                  defaultValue={app.flutter_version ?? ""}
                  placeholder="3.44.2"
                  className="field font-mono"
                />
              </div>
            </div>

            <div>
              <label className="label" htmlFor="sub-note">
                Note
              </label>
              <textarea
                id="sub-note"
                name="note"
                rows={2}
                defaultValue={app.note ?? ""}
                placeholder="Anything the next person should know about this release."
                className="field resize-none"
              />
            </div>

            <p className="rounded-lg bg-muted/60 px-3 py-2 text-[12px] text-muted-foreground">
              Name, store, keystore and store link belong to the app and apply to every release.{" "}
              <Link
                href={`/clients/${clientId}?tab=apps`}
                className="font-medium text-foreground underline-offset-2 hover:underline"
              >
                Edit the app
              </Link>
            </p>

            {error && (
              <p className="rounded-md bg-destructive/10 px-2.5 py-2 text-[12px] text-destructive">
                {error}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t px-5 py-3">
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
