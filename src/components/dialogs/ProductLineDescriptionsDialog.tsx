"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Modal } from "@/components/Modal";
import { Spinner } from "@/components/Spinner";
import { saveLineDescriptions } from "@/lib/actions";
import { PLAY_LIMITS, displayName } from "@/lib/constants";
import type { LineProjectDescription } from "@/lib/queries";

/** The role an app plays in its line — "6amMart-Store-App" reads as "Store app". */
function roleLabel(project: string, line: string): string {
  let role = project;
  if (role.toLowerCase().startsWith(line.toLowerCase())) role = role.slice(line.length);
  role = role.replace(/^[-_\s]+/, "").replace(/[-_\s]*app$/i, "");
  return displayName(role.replace(/[-_]+/g, " ").trim()) || project;
}

/**
 * Write a product line's generic store listing, once per app role. A client of
 * this line can then one-click these into their intake form.
 */
export function ProductLineDescriptionsDialog({
  line,
  projects,
  trigger,
  className = "btn btn-ghost h-7 px-2",
}: {
  line: { id: string; name: string };
  projects: LineProjectDescription[];
  trigger: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [rows, setRows] = useState(() =>
    projects.map((p) => ({
      project_name: p.project_name,
      short: p.short_description ?? "",
      long: p.long_description ?? "",
    })),
  );

  function show() {
    setError(null);
    setRows(
      projects.map((p) => ({
        project_name: p.project_name,
        short: p.short_description ?? "",
        long: p.long_description ?? "",
      })),
    );
    setOpen(true);
  }

  const set = (i: number, k: "short" | "long") => (v: string) =>
    setRows((list) => list.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  function save() {
    setError(null);
    start(async () => {
      const res = await saveLineDescriptions(
        line.id,
        rows.map((r) => ({
          project_name: r.project_name,
          short_description: r.short,
          long_description: r.long,
        })),
      );
      if (!res.ok) return setError(res.error);
      toast.success(`${line.name} descriptions saved`);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button type="button" className={className} onClick={show}>
        {trigger}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`${line.name} store descriptions`}
        subtitle="A client picks these on their intake form in one click, then edits as needed."
        width="max-w-2xl"
      >
        <div className="max-h-[65vh] space-y-5 overflow-y-auto px-5 py-4">
          {rows.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">
              This line has no projects yet. Add some under Edit first.
            </p>
          ) : (
            rows.map((r, i) => (
              <section key={r.project_name} className="rounded-lg border p-3">
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <h3 className="text-[13px] font-semibold">{roleLabel(r.project_name, line.name)} app</h3>
                  <span className="font-mono text-[11px] text-muted-foreground">{r.project_name}</span>
                </div>

                <label className="label" htmlFor={`short-${i}`}>
                  Short description
                  <span className="ml-1 font-normal text-muted-foreground">
                    {r.short.length}/{PLAY_LIMITS.shortDescription}
                  </span>
                </label>
                <input
                  id={`short-${i}`}
                  value={r.short}
                  maxLength={PLAY_LIMITS.shortDescription}
                  onChange={(e) => set(i, "short")(e.target.value)}
                  placeholder="One line about the app"
                  className="field"
                />

                <label className="label mt-3" htmlFor={`long-${i}`}>
                  Full description
                  <span className="ml-1 font-normal text-muted-foreground">
                    {r.long.length}/{PLAY_LIMITS.longDescription}
                  </span>
                </label>
                <textarea
                  id={`long-${i}`}
                  value={r.long}
                  rows={6}
                  maxLength={PLAY_LIMITS.longDescription}
                  onChange={(e) => set(i, "long")(e.target.value)}
                  placeholder="What the app does, as it should appear on the store"
                  className="field resize-y text-[13px]"
                />
              </section>
            ))
          )}

          {error && (
            <p className="rounded-md bg-bad-soft px-2.5 py-2 text-[12px] text-bad">{error}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t px-5 py-3">
          <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button type="button" disabled={pending || rows.length === 0} onClick={save} className="btn btn-primary">
            {pending ? (
              <>
                <Spinner /> Saving…
              </>
            ) : (
              "Save descriptions"
            )}
          </button>
        </div>
      </Modal>
    </>
  );
}
