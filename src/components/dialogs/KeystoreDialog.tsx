"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/Modal";
import { Spinner } from "@/components/Spinner";
import { CodeEditor } from "@/components/CodeEditor";
import { KeystoreDownloadButton } from "@/components/KeystoreDownloadButton";
import { KeyPropertiesButton } from "@/components/KeyPropertiesButton";
import { saveKeystore } from "@/lib/actions";
import type { Keystore } from "@/lib/types";

export function KeystoreDialog({
  clientId,
  keystore,
  trigger,
  className = "btn btn-secondary",
}: {
  clientId: string;
  keystore?: Keystore;
  trigger: string;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [removeFile, setRemoveFile] = useState(false);
  // Loading a key.properties file swaps the editor's contents.
  const [loaded, setLoaded] = useState<{ text: string; n: number } | null>(null);
  const hasFile = Boolean(keystore?.file_path) && !removeFile;

  function openDialog() {
    setError(null);
    setRemoveFile(false);
    setLoaded(null);
    setOpen(true);
  }

  function submit(fd: FormData) {
    setError(null);
    start(async () => {
      const res = await saveKeystore(fd);
      if (!res.ok) return setError(res.error);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button className={className} onClick={openDialog}>
        {trigger}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={keystore ? "Edit keystore" : "Add keystore"}
        subtitle="The signing key shared by this client's apps. Changes apply to every app using it."
      >
        <form action={submit}>
          <div className="space-y-3 px-5 py-4">
            <input type="hidden" name="id" defaultValue={keystore?.id ?? ""} />
            <input type="hidden" name="client_id" defaultValue={clientId} />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="keystore-name">
                  Name
                </label>
                <input
                  id="keystore-name"
                  name="name"
                  required
                  defaultValue={keystore?.name ?? ""}
                  placeholder="Main keystore"
                  className="field"
                />
              </div>
              <div>
                <label className="label" htmlFor="keystore-file">
                  JKS file
                </label>
                {hasFile ? (
                  <div className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[14px]">
                    <span
                      className="min-w-0 flex-1 truncate font-mono"
                      title={keystore?.file_name ?? ""}
                    >
                      {keystore?.file_name}
                    </span>
                    <KeystoreDownloadButton
                      keystoreId={keystore!.id}
                      className="btn btn-ghost px-1.5 py-0.5 text-[12px]"
                    />
                    <button
                      type="button"
                      className="btn btn-ghost px-1.5 py-0.5 text-[12px] text-bad"
                      onClick={() => setRemoveFile(true)}
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <input
                    id="keystore-file"
                    name="file"
                    type="file"
                    accept=".jks,.keystore,.p12"
                    className="field py-1 text-[12px] file:mr-2 file:rounded file:border-0 file:bg-muted file:px-2 file:py-0.5 file:text-[12px]"
                  />
                )}
                {removeFile && <input type="hidden" name="file_remove" value="1" />}
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="label mb-0" htmlFor="keystore-details">
                  JKS details
                </label>
                <KeyPropertiesButton
                  onLoad={(text) => setLoaded((l) => ({ text, n: (l?.n ?? 0) + 1 }))}
                />
              </div>
              <CodeEditor
                key={loaded?.n ?? 0}
                id="keystore-details"
                name="details"
                defaultValue={loaded?.text ?? keystore?.details ?? ""}
                placeholder={"storePassword=\nkeyPassword=\nkeyAlias=\nstoreFile="}
                rows={5}
              />
            </div>

            <div>
              <label className="label" htmlFor="keystore-note">
                Note
              </label>
              <textarea
                id="keystore-note"
                name="note"
                rows={2}
                defaultValue={keystore?.note ?? ""}
                placeholder="Anything specific to this keystore."
                className="field resize-none"
              />
            </div>

            {error && (
              <p className="rounded-md bg-bad-soft px-2.5 py-2 text-[12px] text-bad">
                {error}
              </p>
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
                "Save keystore"
              )}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
