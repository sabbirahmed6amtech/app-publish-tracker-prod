"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/Modal";
import { Spinner } from "@/components/Spinner";
import { addProductsToRelease } from "@/lib/actions";

export type ReleaseCandidate = { id: string; label: string; sub: string };

/** Pick which of the client's apps (not yet in this release) to submit. */
export function AddToReleaseDialog({
  releaseId,
  candidates,
  clientId,
}: {
  releaseId: string;
  candidates: ReleaseCandidate[];
  clientId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();

  function show() {
    setPicked(new Set(candidates.map((c) => c.id)));
    setOpen(true);
  }

  function add() {
    start(async () => {
      const res = await addProductsToRelease(releaseId, [...picked]);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Added ${picked.size} ${picked.size === 1 ? "app" : "apps"} to this release`);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button type="button" className="btn btn-secondary" onClick={show}>
        <PlusIcon className="size-4" />
        Add apps
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add apps to this release"
        subtitle="They start as Ongoing."
        width="max-w-md"
      >
        <div className="px-5 py-4">
          {candidates.length === 0 ? (
            <p className="text-[14px] text-muted-foreground">
              Every app this client has is already in this release.{" "}
              <Link
                href={`/clients/${clientId}?tab=apps`}
                className="font-medium text-foreground hover:underline"
              >
                Add a new app
              </Link>{" "}
              to the client first.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {candidates.map((c) => (
                <li key={c.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 has-checked:border-foreground">
                    <input
                      type="checkbox"
                      checked={picked.has(c.id)}
                      onChange={(e) =>
                        setPicked((s) => {
                          const next = new Set(s);
                          if (e.target.checked) next.add(c.id);
                          else next.delete(c.id);
                          return next;
                        })
                      }
                      className="size-4 accent-foreground"
                    />
                    <span className="min-w-0 leading-tight">
                      <span className="block truncate text-[14px] font-medium">{c.label}</span>
                      <span className="block truncate text-[12px] text-muted-foreground">
                        {c.sub}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t px-5 py-3">
          <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending || picked.size === 0}
            onClick={add}
          >
            {pending ? <Spinner /> : null}
            Add {picked.size || ""}
          </button>
        </div>
      </Modal>
    </>
  );
}
