"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Modal } from "@/components/Modal";
import { Spinner } from "@/components/Spinner";
import { saveSupportArticle } from "@/lib/actions";
import type { SupportArticle } from "@/lib/types";

export function SupportArticleDialog({
  article,
  categories,
  trigger,
  className = "btn btn-primary",
}: {
  article?: SupportArticle;
  categories: string[];
  trigger: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(fd: FormData) {
    setError(null);
    start(async () => {
      const res = await saveSupportArticle(fd);
      if (!res.ok) return setError(res.error);
      toast.success(article ? "Entry updated" : "Entry added");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        {trigger}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={article ? "Edit entry" : "New support entry"}
        subtitle="A common issue and how the team solves it."
        width="max-w-2xl"
      >
        <form action={submit}>
          <div className="space-y-3 px-5 py-4">
            <input type="hidden" name="id" defaultValue={article?.id ?? ""} />

            <div className="grid gap-3 sm:grid-cols-[1fr_1.4fr]">
              <div>
                <label className="label" htmlFor="support-category">
                  Category
                </label>
                <input
                  id="support-category"
                  name="category"
                  list="support-categories"
                  defaultValue={article?.category ?? ""}
                  placeholder="App Store, Play Store, Keystore…"
                  className="field"
                />
                <datalist id="support-categories">
                  {categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="label" htmlFor="support-title">
                  Title
                </label>
                <input
                  id="support-title"
                  name="title"
                  required
                  defaultValue={article?.title ?? ""}
                  placeholder="The issue in one line"
                  className="field"
                />
              </div>
            </div>

            <div>
              <label className="label" htmlFor="support-body">
                Solution
              </label>
              <textarea
                id="support-body"
                name="body"
                required
                rows={10}
                defaultValue={article?.body ?? ""}
                placeholder="What causes it and the steps to fix it."
                className="field resize-y text-[13px] leading-relaxed"
              />
            </div>

            {error && (
              <p className="rounded-md bg-bad-soft px-2.5 py-2 text-[12px] text-bad">{error}</p>
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
