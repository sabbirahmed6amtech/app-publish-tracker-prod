"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangleIcon, EyeIcon, EyeOffIcon } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/Modal";
import { Spinner } from "@/components/Spinner";
import { saveProductListing } from "@/lib/actions";
import {
  APP_STORE_CATEGORIES,
  APP_STORE_LIMITS,
  PLAY_CATEGORIES,
  PLAY_LIMITS,
} from "@/lib/constants";
import type { Platform, Product } from "@/lib/types";

/** One Play app's listing and App Review login — what the publisher fills in. */
export function ListingDialog({
  product,
  platform = "play_store",
  trigger,
  className = "btn btn-ghost h-7 px-2",
}: {
  product: Product;
  /** Which store this app is listed on — the fields differ. */
  platform?: Platform;
  trigger: React.ReactNode;
  className?: string;
}) {
  const ios = platform === "app_store";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [short, setShort] = useState(product.short_description ?? "");
  const [long, setLong] = useState(product.long_description ?? "");
  const [showPassword, setShowPassword] = useState(false);

  function show() {
    setError(null);
    setShort(product.short_description ?? "");
    setLong(product.long_description ?? "");
    setShowPassword(false);
    setOpen(true);
  }

  function submit(fd: FormData) {
    setError(null);
    start(async () => {
      const res = await saveProductListing(fd);
      if (!res.ok) return setError(res.error);
      toast.success("Listing saved");
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
        title={`${product.app_name || product.project_name} · ${ios ? "App Store" : "Play"} listing`}
        subtitle={`What the publisher fills into ${ios ? "App Store Connect" : "Play Console"} for this app.`}
        width="max-w-2xl"
      >
        <form action={submit}>
          <input type="hidden" name="id" value={product.id} />
          <datalist id="play-categories">
            {PLAY_CATEGORIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>

          <div className="space-y-5 px-5 py-4">
            {ios ? (
              <IosFields product={product} />
            ) : (
              <>
            <section className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="ls-package">
                  Package name
                </label>
                <input
                  id="ls-package"
                  name="package_name"
                  defaultValue={product.package_name ?? ""}
                  placeholder="com.client.app"
                  className="field font-mono"
                  autoComplete="off"
                  spellCheck={false}
                />
                <p className="mt-1 flex items-start gap-1 text-[12px] text-warn">
                  <AlertTriangleIcon className="mt-px size-3 shrink-0" />
                  Must match applicationId in build.gradle — it can never change after publishing.
                </p>
              </div>
              <div>
                <label className="label" htmlFor="ls-category">
                  Store category
                </label>
                <input
                  id="ls-category"
                  name="play_category"
                  list="play-categories"
                  defaultValue={product.play_category ?? ""}
                  placeholder="Food & Drink"
                  className="field"
                />
              </div>
            </section>

            <section className="space-y-3">
              <div>
                <div className="mb-1.5 flex items-baseline justify-between">
                  <label className="label mb-0" htmlFor="ls-short">
                    Short description
                  </label>
                  <Counter value={short.length} max={PLAY_LIMITS.shortDescription} />
                </div>
                <input
                  id="ls-short"
                  name="short_description"
                  value={short}
                  onChange={(e) => setShort(e.target.value)}
                  placeholder="One line that sells the app."
                  className="field"
                />
              </div>
              <div>
                <div className="mb-1.5 flex items-baseline justify-between">
                  <label className="label mb-0" htmlFor="ls-long">
                    Full description
                  </label>
                  <Counter value={long.length} max={PLAY_LIMITS.longDescription} />
                </div>
                <textarea
                  id="ls-long"
                  name="long_description"
                  value={long}
                  onChange={(e) => setLong(e.target.value)}
                  rows={6}
                  className="field resize-y"
                />
              </div>
            </section>
              </>
            )}

            <section className="grid gap-3 sm:grid-cols-2">
              <LinkField id="ls-icon" name="icon_url" label="App icon link" value={product.icon_url} />
              <LinkField
                id="ls-shots"
                name="screenshots_url"
                label="Screenshots link"
                value={product.screenshots_url}
              />
              {!ios && (
                <LinkField
                  id="ls-graphic"
                  name="feature_graphic_url"
                  label="Feature graphic link"
                  value={product.feature_graphic_url}
                />
              )}
            </section>

            <section className="rounded-xl border bg-muted/30 p-3.5">
              <h3 className="text-[14px] font-semibold">App Review access</h3>
              <p className="mb-3 text-[12px] text-muted-foreground">
                A working login Google&apos;s reviewers can use. Team-only — never shown on the
                public tracker.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="ls-instr">
                    Instruction name
                  </label>
                  <input
                    id="ls-instr"
                    name="demo_instructions"
                    defaultValue={product.demo_instructions ?? ""}
                    placeholder="Delivery account"
                    className="field"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="ls-login">
                    Login (email / phone / username)
                  </label>
                  <input
                    id="ls-login"
                    name="demo_login"
                    defaultValue={product.demo_login ?? ""}
                    autoComplete="off"
                    className="field"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="ls-pass">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="ls-pass"
                      name="demo_password"
                      type={showPassword ? "text" : "password"}
                      defaultValue={product.demo_password ?? ""}
                      autoComplete="new-password"
                      className="field pr-9"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      className="absolute right-1.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOffIcon className="size-3.5" /> : <EyeIcon className="size-3.5" />}
                    </button>
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className="label" htmlFor="ls-details">
                    Extra details for reviewers
                  </label>
                  <textarea
                    id="ls-details"
                    name="demo_details"
                    rows={2}
                    defaultValue={product.demo_details ?? ""}
                    placeholder="e.g. tap Set From Map, search 'Mirpur DOHS', then Pick Location."
                    className="field resize-y"
                  />
                </div>
              </div>
            </section>

            {error && (
              <p className="rounded-md bg-bad-soft px-2.5 py-2 text-[12px] text-bad">{error}</p>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t px-5 py-3">
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" disabled={pending} className="btn btn-primary">
              {pending ? <Spinner /> : null} Save listing
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

/** A link the client shared (icon, screenshots folder, banner), with a way to open it. */
function LinkField({
  id,
  name,
  label,
  value,
}: {
  id: string;
  name: string;
  label: string;
  value: string | null;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <label className="label mb-0" htmlFor={id}>
          {label}
        </label>
        {value && (
          <a
            href={value}
            target="_blank"
            rel="noreferrer"
            className="text-[12px] font-medium text-muted-foreground hover:text-foreground hover:underline"
          >
            Open
          </a>
        )}
      </div>
      <input
        id={id}
        name={name}
        type="url"
        defaultValue={value ?? ""}
        placeholder="https://drive.google.com/…"
        className="field"
      />
    </div>
  );
}

function Counter({ value, max }: { value: number; max: number }) {
  return (
    <span
      className={`text-[12px] tabular-nums ${
        value > max ? "font-semibold text-bad" : "text-muted-foreground"
      }`}
    >
      {value}/{max}
    </span>
  );
}

/** The App Store Connect side of the listing. */
function IosFields({ product }: { product: Product }) {
  const [subtitle, setSubtitle] = useState(product.ios_subtitle ?? "");
  const [keywords, setKeywords] = useState(product.ios_keywords ?? "");
  const [promo, setPromo] = useState(product.ios_promo_text ?? "");
  const [description, setDescription] = useState(product.long_description ?? "");

  return (
    <>
      <datalist id="app-store-categories">
        {APP_STORE_CATEGORIES.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <section className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="ls-bundle">
            Bundle ID
          </label>
          <input
            id="ls-bundle"
            name="package_name"
            defaultValue={product.package_name ?? ""}
            placeholder="com.client.app"
            className="field font-mono"
            autoComplete="off"
            spellCheck={false}
          />
          <p className="mt-1 flex items-start gap-1 text-[12px] text-warn">
            <AlertTriangleIcon className="mt-px size-3 shrink-0" />
            Register it on developer.apple.com first — App Store Connect only offers registered
            IDs.
          </p>
        </div>
        <div>
          <label className="label" htmlFor="ls-sku">
            SKU
          </label>
          <input
            id="ls-sku"
            name="ios_sku"
            defaultValue={product.ios_sku ?? ""}
            placeholder="Defaults to the bundle ID"
            className="field font-mono"
            autoComplete="off"
          />
        </div>
        <div>
          <label className="label" htmlFor="ls-cat1">
            Primary category
          </label>
          <input
            id="ls-cat1"
            name="ios_primary_category"
            list="app-store-categories"
            defaultValue={product.ios_primary_category ?? ""}
            placeholder="Food & Drink"
            className="field"
          />
        </div>
        <div>
          <label className="label" htmlFor="ls-cat2">
            Secondary category
          </label>
          <input
            id="ls-cat2"
            name="ios_secondary_category"
            list="app-store-categories"
            defaultValue={product.ios_secondary_category ?? ""}
            placeholder="Optional"
            className="field"
          />
        </div>
      </section>

      <section className="space-y-3">
        <Counted label="Subtitle" value={subtitle} max={APP_STORE_LIMITS.subtitle}>
          <input
            id="ls-subtitle"
            name="ios_subtitle"
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            placeholder="A short line under the app name"
            className="field"
          />
        </Counted>
        <Counted label="Keywords" value={keywords} max={APP_STORE_LIMITS.keywords}>
          <input
            id="ls-keywords"
            name="ios_keywords"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="food,delivery,grocery — commas, no spaces"
            className="field"
          />
        </Counted>
        <Counted label="Promotional text" value={promo} max={APP_STORE_LIMITS.promoText}>
          <textarea
            id="ls-promo"
            name="ios_promo_text"
            rows={2}
            value={promo}
            onChange={(e) => setPromo(e.target.value)}
            className="field resize-y"
          />
        </Counted>
        <Counted label="Description" value={description} max={APP_STORE_LIMITS.description}>
          <textarea
            id="ls-description"
            name="long_description"
            rows={6}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="field resize-y"
          />
        </Counted>
        <div>
          <label className="label" htmlFor="ls-copyright">
            Copyright
          </label>
          <input
            id="ls-copyright"
            name="ios_copyright"
            defaultValue={product.ios_copyright ?? ""}
            placeholder={`Defaults to "© ${new Date().getFullYear()} <client name>"`}
            className="field"
          />
        </div>
      </section>
    </>
  );
}

function Counted({
  label,
  value,
  max,
  children,
}: {
  label: string;
  value: string;
  max: number;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="label mb-0">{label}</span>
        <Counter value={value.length} max={max} />
      </div>
      {children}
    </div>
  );
}
