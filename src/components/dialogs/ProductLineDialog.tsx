"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Modal } from "@/components/Modal";
import { Spinner } from "@/components/Spinner";
import { ProjectLogo } from "@/components/ProjectLogo";
import { saveProductLine } from "@/lib/actions";
import type { ProductLine } from "@/lib/types";

/** Add or edit a product line: name, logo, and its projects one per line. */
export function ProductLineDialog({
  line,
  trigger,
  className = "btn btn-secondary",
}: {
  line?: ProductLine;
  trigger: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [name, setName] = useState(line?.name ?? "");
  const [preview, setPreview] = useState<string | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);

  // Let go of the local preview URL when it's replaced or the dialog closes.
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  function show() {
    setError(null);
    setName(line?.name ?? "");
    setPreview(null);
    setRemoveLogo(false);
    setOpen(true);
  }

  function submit(fd: FormData) {
    setError(null);
    start(async () => {
      const res = await saveProductLine(fd);
      if (!res.ok) return setError(res.error);
      toast.success(line ? "Product line updated" : "Product line added");
      setOpen(false);
      router.refresh();
    });
  }

  const currentLogo = preview ?? (removeLogo ? null : (line?.logo_url ?? null));

  return (
    <>
      <button type="button" className={className} onClick={show}>
        {trigger}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={line ? `Edit ${line.name}` : "New product line"}
        subtitle="Its logo shows on every app built from these projects."
        width="max-w-md"
      >
        <form action={submit}>
          <div className="space-y-4 px-5 py-4">
            <input type="hidden" name="id" value={line?.id ?? ""} />
            {removeLogo && <input type="hidden" name="logo_remove" value="1" />}

            <div className="flex items-end gap-3">
              <ProjectLogo
                badge={{ line: name || "?", logo: currentLogo }}
                project={name || "?"}
                size="lg"
              />
              <div className="min-w-0 flex-1">
                <label className="label" htmlFor="line-name">
                  Name
                </label>
                <input
                  id="line-name"
                  name="name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="6amMart"
                  className="field"
                />
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="label mb-0" htmlFor="line-logo">
                  Logo
                </label>
                {currentLogo && (
                  <button
                    type="button"
                    className="text-[12px] font-medium text-destructive hover:underline"
                    onClick={() => {
                      setPreview(null);
                      setRemoveLogo(true);
                      const input = document.getElementById("line-logo") as HTMLInputElement;
                      if (input) input.value = "";
                    }}
                  >
                    Remove
                  </button>
                )}
              </div>
              <input
                id="line-logo"
                name="logo"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  setPreview(file ? URL.createObjectURL(file) : null);
                  if (file) setRemoveLogo(false);
                }}
                className="field py-1 text-[12px] file:mr-2 file:rounded file:border-0 file:bg-muted file:px-2 file:py-0.5 file:text-[12px]"
              />
              <p className="mt-1 text-[12px] text-muted-foreground">
                PNG, JPG, WebP or SVG, up to 1 MB. Square works best.
              </p>
            </div>

            <div>
              <label className="label" htmlFor="line-projects">
                Projects
              </label>
              <textarea
                id="line-projects"
                name="projects"
                rows={5}
                defaultValue={line?.projects.join("\n") ?? ""}
                placeholder={"6amMart-User-App\n6amMart-Store-App\n6amMart-Delivery-App"}
                className="field resize-y font-mono text-[12px]"
              />
              <p className="mt-1 text-[12px] text-muted-foreground">
                One per line. These are offered when setting up a client, and apps with these
                project names show this line&apos;s logo.
              </p>
            </div>

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
