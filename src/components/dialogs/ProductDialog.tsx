"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Modal } from "@/components/Modal";
import { Spinner } from "@/components/Spinner";
import { StoreIcon } from "@/components/StoreIcon";
import { saveProduct } from "@/lib/actions";
import { PLATFORMS } from "@/lib/constants";
import type { Keystore, Product, PublisherAccount } from "@/lib/types";

/**
 * Add or edit one of a client's permanent apps. Adding can target several
 * stores at once — one listing is created per store.
 */
export function ProductDialog({
  clientId,
  accounts,
  keystores,
  product,
  suggestions,
  trigger,
  className = "btn btn-secondary",
}: {
  /** Project names to suggest: the product lines' plus any already in use. */
  suggestions: string[];
  clientId: string;
  accounts: PublisherAccount[];
  keystores: Keystore[];
  product?: Product;
  trigger: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const defaultKeystore = product
    ? (product.keystore_id ?? "")
    : keystores.length === 1
      ? keystores[0].id
      : "";

  function submit(fd: FormData) {
    setError(null);
    start(async () => {
      const res = await saveProduct(fd);
      if (!res.ok) return setError(res.error);
      toast.success(product ? "App updated everywhere it's used" : "App added");
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
        title={product ? "Edit app" : "Add app"}
        subtitle={
          product
            ? "Changes apply to this app in every release, past and future."
            : "Set up once; it's included every time you start a new release."
        }
        width="max-w-lg"
      >
        {accounts.length === 0 ? (
          <p className="px-5 py-6 text-[14px] text-muted-foreground">
            Add a store account first (Credentials tab) — every app is published under one.
          </p>
        ) : (
          <form action={submit}>
            <div className="space-y-3 px-5 py-4">
              <input type="hidden" name="id" value={product?.id ?? ""} />
              <input type="hidden" name="client_id" value={clientId} />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="prod-project">
                    Project
                  </label>
                  <input
                    id="prod-project"
                    name="project_name"
                    required
                    list="prod-projects"
                    defaultValue={product?.project_name ?? ""}
                    placeholder="6amMart-User-App"
                    className="field"
                  />
                  <datalist id="prod-projects">
                    {suggestions.map((p) => (
                      <option key={p} value={p} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="label" htmlFor="prod-name">
                    Store listing name
                  </label>
                  <input
                    id="prod-name"
                    name="app_name"
                    defaultValue={product?.app_name ?? ""}
                    placeholder="ZippyGo"
                    className="field"
                  />
                </div>
              </div>

              {product ? (
                <div>
                  <label className="label" htmlFor="prod-account">
                    Store
                  </label>
                  <select
                    id="prod-account"
                    name="account_id"
                    defaultValue={product.account_id}
                    className="field"
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {PLATFORMS[a.platform].label} — {a.account_name || "unnamed account"}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <fieldset>
                  <legend className="label">Stores</legend>
                  <div className="flex flex-wrap gap-2">
                    {accounts.map((a) => (
                      <label
                        key={a.id}
                        className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[14px] has-checked:border-foreground"
                      >
                        <input
                          type="checkbox"
                          name="account_ids"
                          value={a.id}
                          defaultChecked
                          className="size-4 accent-foreground"
                        />
                        <StoreIcon platform={a.platform} size={14} />
                        {PLATFORMS[a.platform].label}
                        <span className="text-muted-foreground">{a.account_name}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="prod-keystore">
                    Keystore
                  </label>
                  <select
                    id="prod-keystore"
                    name="keystore_id"
                    defaultValue={defaultKeystore}
                    className="field"
                  >
                    <option value="">None</option>
                    {keystores.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="prod-url">
                    Store link
                  </label>
                  <input
                    id="prod-url"
                    name="store_url"
                    type="url"
                    defaultValue={product?.store_url ?? ""}
                    placeholder="https://…"
                    className="field"
                  />
                </div>
              </div>

              <div>
                <label className="label" htmlFor="prod-note">
                  Note
                </label>
                <textarea
                  id="prod-note"
                  name="note"
                  rows={2}
                  defaultValue={product?.note ?? ""}
                  placeholder="Anything true of this app every release."
                  className="field resize-none"
                />
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
                ) : product ? (
                  "Save app"
                ) : (
                  "Add app"
                )}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
