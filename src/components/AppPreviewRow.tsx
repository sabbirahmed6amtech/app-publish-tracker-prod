"use client";

import { useCallback, useState, type MouseEvent, type ReactNode } from "react";
import { Drawer } from "@/components/Drawer";
import { StatusChip } from "@/components/StatusChip";
import { CopyButton } from "@/components/CopyButton";
import { CodeEditor } from "@/components/CodeEditor";
import { KeystoreDownloadButton } from "@/components/KeystoreDownloadButton";
import { formatDate, PLATFORMS, STATUSES } from "@/lib/constants";
import { ImageIcon } from "lucide-react";
import type { AppImages } from "@/lib/appImages";
import { StoreCheckButton } from "@/components/StoreCheckButton";
import { StoreIcon } from "@/components/StoreIcon";
import { liveButNotMoved, timeAgo, type StoreInfo } from "@/lib/storeWatch";
import type { App, Keystore, Platform } from "@/lib/types";

// Clicks on these keep doing their own job instead of opening the preview.
const INTERACTIVE = "a, button, input, select, textarea, label, [data-modal]";

/**
 * A table row that opens a read-only preview of the app when clicked. The
 * cells are passed in as children so the page can keep rendering them.
 */
export function AppPreviewRow({
  app,
  accountName,
  assigneeName,
  keystore,
  images = null,
  publish,
  store = null,
  releaseVersion = null,
  platform,
  className,
  children,
}: {
  app: App;
  accountName: string;
  assigneeName: string | null;
  keystore: Keystore | null;
  images?: AppImages | null;
  /** The Publish button for this app, when it can be published. */
  publish?: ReactNode;
  /** What Store Watch last saw on the store. */
  store?: StoreInfo | null;
  releaseVersion?: string | null;
  platform?: Platform;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  function onClick(e: MouseEvent<HTMLTableRowElement>) {
    // React bubbles portal clicks (the drawer itself) up to this row too.
    if (!e.currentTarget.contains(e.target as Node)) return;
    if ((e.target as HTMLElement).closest(INTERACTIVE)) return;
    // Selecting text in a cell shouldn't count as a click.
    if (window.getSelection()?.toString()) return;
    setOpen(true);
  }

  return (
    <>
      <tr className={`cursor-pointer ${className ?? ""}`} onClick={onClick}>
        {children}
      </tr>

      <AppPreviewSheet
        open={open}
        onClose={close}
        app={app}
        accountName={accountName}
        assigneeName={assigneeName}
        keystore={keystore}
        images={images}
        publish={publish}
        store={store}
        releaseVersion={releaseVersion}
        platform={platform}
      />
    </>
  );
}

/** The read-only app preview; shared by table rows and board cards. */
export function AppPreviewSheet({
  open,
  onClose,
  app,
  accountName,
  assigneeName,
  keystore,
  images = null,
  publish,
  store = null,
  releaseVersion = null,
  platform,
}: {
  open: boolean;
  onClose: () => void;
  app: App;
  accountName: string;
  assigneeName: string | null;
  keystore: Keystore | null;
  /** Links the client shared; the developer downloads and uploads them by hand. */
  images?: AppImages | null;
  /** The Publish button for this app, shown at the top. */
  publish?: ReactNode;
  /** What Store Watch last saw on the store, and the release's version to compare. */
  store?: StoreInfo | null;
  releaseVersion?: string | null;
  platform?: Platform;
}) {
  const storeName = platform ? PLATFORMS[platform].label : "the store";
  const liveNow = liveButNotMoved(store, app.status, app.build_version, releaseVersion);
  const imageLinks = images
    ? ([
        ["Icon", images.icon],
        ["Screenshots", images.screenshots],
        ["Banner", images.banner],
      ].filter((l): l is [string, string] => !!l[1]))
    : [];
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={app.app_name || app.project_name}
      subtitle={app.app_name ? app.project_name : undefined}
    >
      {liveNow && (
        <div className="flex items-start gap-3 border-b bg-good-soft px-5 py-3.5">
          <span className="relative mt-1.5 flex size-2.5 shrink-0">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--st-production)] opacity-60" />
            <span className="relative inline-flex size-2.5 rounded-full bg-[var(--st-production)]" />
          </span>
          <div className="min-w-0 text-[13px]">
            <p className="font-semibold text-good">
              Live on {storeName} · v{store?.version}
            </p>
            <p className="text-[12px] text-muted-foreground">
              {store?.updatedAt ? `The store updated ${timeAgo(store.updatedAt)}. ` : ""}
              The tracker still says {STATUSES[app.status].label} — move it to Production.
            </p>
            {store?.url && (
              <a
                href={store.url}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block text-[12px] font-medium text-good hover:underline"
              >
                See it on the store →
              </a>
            )}
          </div>
        </div>
      )}
      {publish && <div className="border-b px-5 py-3">{publish}</div>}
      <dl className="divide-y divide-border px-5">
        <Field label="Status">
          <StatusChip status={app.status} since={app.status_changed_at} />
        </Field>
        <Field label="Published to" copy={accountName || undefined}>
          <span className="flex min-w-0 items-center gap-1.5">
            {platform && <StoreIcon platform={platform} size={14} />}
            <span className="truncate">{accountName}</span>
          </span>
        </Field>
        <Field label="Project" copy={app.project_name}>
          {app.project_name}
        </Field>
        <Field label="App name" copy={app.app_name || undefined}>
          {app.app_name || null}
        </Field>
        <Field label="Assigned to">{assigneeName}</Field>
        <Field label="Build version" copy={app.build_version ?? undefined} mono>
          {app.build_version}
        </Field>
        <Field label="Flutter version" copy={app.flutter_version ?? undefined} mono>
          {app.flutter_version}
        </Field>
        <Field label="Store link" copy={app.store_url ?? undefined}>
          {app.store_url && (
            <a
              href={app.store_url}
              target="_blank"
              rel="noreferrer"
              className="break-all text-info hover:underline"
            >
              {app.store_url}
            </a>
          )}
        </Field>
        <Field label="On store">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 text-[13px]">
              {!store || store.live === null ? (
                <span className="text-muted-foreground">Not checked yet</span>
              ) : store.live ? (
                <span>
                  <span className="font-medium text-good">Live</span>
                  {store.version && <> · v{store.version}</>}
                  {store.updatedAt && <> · updated {formatDate(store.updatedAt)}</>}
                </span>
              ) : (
                <span className="text-muted-foreground">Not on the store yet</span>
              )}
              {store?.error && <p className="text-[11px] text-bad">Last check failed: {store.error}</p>}
              {store?.checkedAt && (
                <p className="text-[11px] text-muted-foreground">
                  Checked {new Date(store.checkedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                </p>
              )}
            </div>
            <StoreCheckButton productId={app.product_id} onNavigate={onClose} />
          </div>
        </Field>
        <Field label="Metadata">
          {imageLinks.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {imageLinks.map(([label, url]) => (
                <a
                  key={label}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-1 text-[12px] font-medium hover:border-ring/60 hover:bg-muted"
                >
                  <ImageIcon className="size-3.5 text-muted-foreground" />
                  {label}
                </a>
              ))}
            </div>
          )}
        </Field>
        <Field label="Client note">
          {images?.note && <p className="whitespace-pre-wrap">{images.note}</p>}
        </Field>
        <Field label="Keystore">{keystore?.name}</Field>
        <Field label="JKS file">
          {keystore?.file_path && (
            <div className="flex items-center gap-2">
              <span
                className="min-w-0 truncate font-mono text-[12px]"
                title={keystore.file_name ?? ""}
              >
                {keystore.file_name}
              </span>
              <KeystoreDownloadButton keystoreId={keystore.id} />
            </div>
          )}
        </Field>
        <div className="py-2.5">
          <dt className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            JKS details
          </dt>
          <dd>
            {keystore?.details ? (
              <CodeEditor
                key={keystore.id + keystore.updated_at}
                name="jks-preview"
                defaultValue={keystore.details}
                rows={1}
                readOnly
              />
            ) : (
              <span className="text-[13px] text-muted-foreground/50">—</span>
            )}
          </dd>
        </div>
        <Field label="Note">
          {app.note && <p className="whitespace-pre-wrap">{app.note}</p>}
        </Field>
        <Field label="Status changed">{formatDate(app.status_changed_at)}</Field>
        <Field label="Added">{formatDate(app.created_at)}</Field>
        <Field label="Last updated">{formatDate(app.updated_at)}</Field>
      </dl>
    </Drawer>
  );
}

function Field({
  label,
  copy,
  mono,
  children,
}: {
  label: string;
  copy?: string;
  mono?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[120px_1fr] items-start gap-3 py-2.5">
      <dt className="pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd
        className={`flex min-w-0 items-start gap-1 text-[13px] text-foreground ${
          mono ? "font-mono text-[12px]" : ""
        }`}
      >
        <div className="min-w-0 flex-1">
          {children ?? <span className="font-sans text-muted-foreground/50">—</span>}
        </div>
        {copy && <CopyButton value={copy} label={`Copy ${label.toLowerCase()}`} />}
      </dd>
    </div>
  );
}
