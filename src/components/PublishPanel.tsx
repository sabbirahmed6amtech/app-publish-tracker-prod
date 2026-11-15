"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangleIcon,
  CheckIcon,
  ChevronDownIcon,
  ExternalLinkIcon,
  Loader2Icon,
  PartyPopperIcon,
  PauseIcon,
  PuzzleIcon,
  RefreshCwIcon,
  RocketIcon,
  ShieldCheckIcon,
  TerminalIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { StoreIcon } from "@/components/StoreIcon";
import { ProjectLogo } from "@/components/ProjectLogo";
import { CopyReportButton } from "@/components/CopyReportButton";
import { ListingDialog } from "@/components/dialogs/ListingDialog";
import { ClientPlayDialog } from "@/components/dialogs/ClientPlayDialog";
import {
  usePublisherBridge,
  type PublisherState,
  type PublisherStep,
} from "@/lib/publisherBridge";
import {
  publishChecks,
  publishChecksIos,
  publishData,
  publishDataIos,
  updateChecks,
  type PublishCheck,
  type PublishMode,
} from "@/lib/publish";
import type { Client, LineBadge, Platform, Product } from "@/lib/types";

// Everything that differs between the two stores, in one place.
const STORE = {
  play_store: {
    store: "Play Store",
    console: "Play Console",
    idLabel: "Package name",
    idCheck: "applicationId in build.gradle. It can't change after publishing.",
    accountLabel: "Developer account",
    accountNote:
      "Picked by name the first time, then remembered. A wrong account wastes the package name for good.",
    clientButton: "Edit client store details",
    footnote:
      'Advertising ID is answered "No". Uploading the AAB, release notes and submitting for review stay with you — review everything before you submit.',
    steps: [
      "Create app",
      "Privacy policy",
      "Sign in details",
      "Ads",
      "Content rating",
      "Target audience",
      "Data safety",
      "Government apps",
      "Financial features",
      "Health",
      "Store settings",
      "Store listings",
      "Advertising ID",
    ],
  },
  app_store: {
    store: "App Store",
    console: "App Store Connect",
    idLabel: "Bundle ID",
    idCheck:
      "is registered on developer.apple.com and matches the Xcode project. It can't change after the app is created.",
    accountLabel: "Team",
    accountNote:
      "The run checks App Store Connect is on this team before creating anything, and pauses for you if it can't tell.",
    clientButton: "Edit client store details",
    footnote:
      "Screenshots, choosing the build and submitting for review stay with you — review everything before you submit.",
    steps: [
      "Create app",
      "App Information",
      "Age rating",
      "Pricing & Availability",
      "App Privacy",
      "Version page",
      "App Review info",
    ],
  },
} as const;

// An update to an app that's already live: far fewer steps. The build and any
// release notes stay with the person — the run pauses for them.
const UPDATE = {
  play_store: {
    steps: ["Find app", "New release", "Review release"],
    footnote:
      "The run pauses for you to upload the new AAB (and add release notes if you like). Starting the rollout stays with you.",
    next: "Next, by hand: check the review page, save, and start the rollout to Production.",
  },
  app_store: {
    steps: ["Find app", "New version", "Save"],
    footnote:
      "The run pauses for you to pick the build (and add What's New if you like). Submitting for review stays with you.",
    next: "Next, by hand: review the version page and click Add for Review.",
  },
} as const;

const CONSOLE_URL = {
  play_store: "https://play.google.com/console",
  app_store: "https://appstoreconnect.apple.com/apps",
} as const;

/**
 * Hands a Play Store app to the "Play Console Publisher" extension: it opens
 * Play Console in a new tab and fills the 13 setup sections, while this panel
 * shows its progress. Uploading the build and submitting stay manual.
 */
export function PublishPanel({
  client,
  product,
  platform = "play_store",
  accountName,
  badge,
  mode = "publish",
  version,
  triggerLabel,
  triggerClassName = "btn btn-ghost h-7 gap-1 px-2 text-[12px]",
}: {
  client: Client;
  product: Product;
  /** Which store to publish to. */
  platform?: Platform;
  /** The developer account (Play) or team (App Store) this app belongs under. */
  accountName: string;
  /** The app's product-line logo, for the header. */
  badge?: LineBadge;
  /** A first publish, or an update to an app that's already live. */
  mode?: PublishMode;
  /** The release's version — the App Store version an update creates. */
  version?: string;
  /** The button that opens the popup — a small one in tables, a big one in the drawer. */
  triggerLabel?: string;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const update = mode === "update";
  const Icon = update ? RefreshCwIcon : RocketIcon;

  return (
    <>
      <button
        type="button"
        className={triggerClassName}
        onClick={() => setOpen(true)}
        title={
          update
            ? `Start a new release of this app in ${STORE[platform].console}`
            : `Fill ${STORE[platform].console} for this app`
        }
      >
        <Icon className="size-3.5" />
        {triggerLabel ?? (update ? "Update" : "Publish")}
      </button>
      {open && (
        // A wide popup rather than a side drawer: details on the left, the
        // 13-step timeline on the right.
        <Dialog open onOpenChange={(next) => !next && setOpen(false)}>
          <DialogContent
            data-modal
            className="max-h-[calc(100dvh-2rem)] gap-0 overflow-hidden p-0 sm:max-w-[min(1240px,calc(100vw-2rem))]"
          >
            <DialogTitle className="sr-only">
              {update ? "Update" : "Publish"} {product.app_name || product.project_name}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Fill {STORE[platform].console} for this app
            </DialogDescription>
            <PanelBody
              client={client}
              product={product}
              platform={platform}
              accountName={accountName}
              badge={badge}
              mode={mode}
              version={version}
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────── body ──

function PanelBody({
  client,
  product,
  platform,
  accountName,
  badge,
  mode,
  version,
}: {
  client: Client;
  product: Product;
  platform: Platform;
  accountName: string;
  badge?: LineBadge;
  mode: PublishMode;
  version?: string;
}) {
  const store = STORE[platform];
  const update = mode === "update";
  const steps = update ? UPDATE[platform].steps : store.steps;
  const bridge = usePublisherBridge();
  const [confirmed, setConfirmed] = useState(false);
  const [launching, setLaunching] = useState(false);

  const ios = platform === "app_store";
  const base = ios ? publishDataIos(client, product) : publishData(client, product);
  const data = update ? { ...base, mode, version: version ?? "" } : base;
  const checks = update
    ? updateChecks(data, platform)
    : ios
      ? publishChecksIos(data as ReturnType<typeof publishDataIos>)
      : publishChecks(data as ReturnType<typeof publishData>);
  const appId = ios
    ? (data as ReturnType<typeof publishDataIos>).bundleId
    : (data as ReturnType<typeof publishData>).packageName;
  const blocking = checks.filter((c) => c.required && !c.ok);

  const run = bridge.state;
  const active = !!run && ["starting", "running", "paused"].includes(run.phase);
  const ours = !!run && run.phase !== "idle" && run.jobId === product.id;
  const someoneElse = active && !ours;

  // Check → Confirm → Launch (4 = launched and every section filled)
  const finishedClean =
    ours && run?.phase === "done" && run.steps.every((st) => st.status === "done");
  const stage = finishedClean ? 4 : ours ? 3 : confirmed && blocking.length === 0 ? 2 : 1;

  async function start() {
    setLaunching(true);
    const res = await bridge.start({
      jobId: product.id,
      appData: data,
      expectedAccount: accountName,
    });
    if (!res.ok) {
      setLaunching(false);
      toast.error(res.error ?? "Couldn't start the run.");
    } else {
      toast.success(`${store.console} is opening in a new tab`);
      setTimeout(() => setLaunching(false), 800);
    }
  }

  const canStart =
    !!bridge.installed && !bridge.stale && blocking.length === 0 && confirmed && !someoneElse;

  return (
    <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
      <Hero
        product={product}
        platform={platform}
        badge={badge}
        stage={stage}
        update={update}
        version={version}
      />

      <div className="grid min-h-0 flex-1 md:grid-cols-[1fr_340px] xl:grid-cols-[1fr_380px]">
        <div className="min-h-0 space-y-4 overflow-y-auto p-5">
          <ExtensionStatus
            installed={bridge.installed}
            stale={bridge.stale}
            version={bridge.version}
          />

          {ours && run ? (
            <RunSummary
              run={run}
              consoleName={store.console}
              consoleUrl={CONSOLE_URL[platform]}
              next={update ? UPDATE[platform].next : undefined}
              noun={update ? "steps" : "sections"}
              onContinue={() => bridge.send("CONTINUE")}
              onStop={() => bridge.send("STOP")}
              onReset={() => bridge.send("RESET")}
            />
          ) : (
            <>
              {/* On wide screens: the checklist beside the account, switch and launch. */}
              <div className="grid items-start gap-4 xl:grid-cols-2">
                <Readiness
                    checks={checks}
                    client={client}
                    product={product}
                    platform={platform}
                  />
                <div className="space-y-4">
                  <AccountCard accountName={accountName} platform={platform} />

                  <Toggle
                    checked={confirmed}
                    onChange={setConfirmed}
                    title={`${store.idLabel} verified`}
                    detail={
                      <>
                        <span className="font-mono">{appId || "—"}</span>{" "}
                        {ios ? store.idCheck : `matches ${store.idCheck}`}
                      </>
                    }
                  />

                  {someoneElse && (
                    <p className="tracker-rise rounded-xl bg-muted px-3.5 py-2.5 text-[12px] text-muted-foreground">
                      Another app is publishing right now ({run?.appData?.appName}). Wait for it to
                      finish, or stop it first.
                    </p>
                  )}

                  <LaunchButton
                    disabled={!canStart || launching}
                    launching={launching}
                    onClick={start}
                    label={`Open ${store.console} and start${update ? " the update" : ""}`}
                  />
                  <p className="text-center text-[12px] text-muted-foreground">
                    {blocking.length > 0
                      ? `Add the ${blocking.map((b) => b.label.toLowerCase()).join(" and ")} to continue.`
                      : !confirmed
                        ? `Confirm the ${store.idLabel.toLowerCase()} to continue.`
                        : update
                          ? `${store.console} opens in a new tab and runs ${steps.length} steps, pausing for the build.`
                          : `${store.console} opens in a new tab and fills ${steps.length} sections.`}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        <aside className="min-h-0 overflow-y-auto border-t bg-muted/30 p-5 md:border-l md:border-t-0">
          <Timeline
            steps={
              ours && run
                ? run.steps
                : steps.map((name) => ({ name, status: "pending" as const }))
            }
            live={!!ours}
            footnote={update ? UPDATE[platform].footnote : store.footnote}
            noun={update ? "steps" : "sections"}
          />
        </aside>
      </div>
    </div>
  );
}

/** The Publish button as the app side drawer shows it: full width, naming the store. */
export function DrawerPublishButton(props: Omit<Parameters<typeof PublishPanel>[0], "triggerLabel" | "triggerClassName">) {
  const platform = props.platform ?? "play_store";
  return (
    <PublishPanel
      {...props}
      triggerLabel={
        props.mode === "update" ? `Update in ${STORE[platform].store}` : `Publish to ${STORE[platform].store}`
      }
      triggerClassName="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl text-[14px] font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md [background:linear-gradient(135deg,var(--st-production),color-mix(in_oklch,var(--st-production)_55%,var(--st-ongoing)))]"
    />
  );
}

// ─────────────────────────────────────────────────────────────── hero ──

const STAGES = ["Check", "Confirm", "Launch"];

function Hero({
  product,
  platform,
  badge,
  stage,
  update,
  version,
}: {
  product: Product;
  platform: Platform;
  badge?: LineBadge;
  stage: number;
  update: boolean;
  version?: string;
}) {
  return (
    <header className="relative overflow-hidden border-b px-5 pb-4 pt-5">
      {/* a soft brand wash behind the header */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(120% 90% at 0% 0%, color-mix(in oklch, var(--st-production) 14%, transparent), transparent 60%), radial-gradient(90% 80% at 100% 0%, color-mix(in oklch, var(--st-ongoing) 16%, transparent), transparent 60%)",
        }}
      />
      <div className="relative flex items-center gap-3.5 pr-8">
        <div className="relative">
          <ProjectLogo badge={badge} project={product.project_name} size="lg" />
          <span className="absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-full border bg-card shadow-xs">
            <StoreIcon platform={platform} size={11} />
          </span>
        </div>
        <div className="min-w-0">
          <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
            {update ? "Update in" : "Publish to"} {STORE[platform].store}
            {update && version ? ` · version ${version}` : ""}
          </p>
          <h2 className="truncate text-[20px] font-semibold leading-tight">
            {product.app_name || product.project_name}
          </h2>
          <p className="truncate font-mono text-[12px] text-muted-foreground">
            {product.package_name || "no package name yet"}
          </p>
        </div>
      </div>

      <ol className="relative mt-4 flex items-center">
        {STAGES.map((label, i) => {
          const n = i + 1;
          const done = stage > n;
          const current = stage === n;
          return (
            <li key={label} className="flex flex-1 items-center last:flex-none">
              <span className="flex items-center gap-1.5">
                <span
                  className={`grid size-5 place-items-center rounded-full text-[11px] font-semibold transition-colors ${
                    done
                      ? "bg-[var(--st-production)] text-white"
                      : current
                        ? "bg-foreground text-background"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {done ? <CheckIcon className="pub-pop size-3" strokeWidth={3} /> : n}
                </span>
                <span
                  className={`text-[12px] font-medium ${
                    current || done ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {label}
                </span>
              </span>
              {n < STAGES.length && (
                <span className="relative mx-2 h-0.5 flex-1 overflow-hidden rounded-full bg-border">
                  <span
                    className="absolute inset-y-0 left-0 bg-[var(--st-production)] transition-[width] duration-500"
                    style={{ width: done ? "100%" : "0%" }}
                  />
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </header>
  );
}

// ────────────────────────────────────────────────────────── readiness ──

function Readiness({
  checks,
  client,
  product,
  platform,
}: {
  checks: PublishCheck[];
  client: Client;
  product: Product;
  platform: Platform;
}) {
  const ready = checks.filter((c) => c.ok).length;
  const complete = ready === checks.length;
  const [open, setOpen] = useState(true);

  return (
    <section className="tracker-rise rounded-2xl border bg-card p-4 shadow-xs">
      <div className="flex items-center gap-4">
        <Ring value={ready} total={checks.length} />
        <div className="min-w-0 flex-1">
          <h3 className="text-[14px] font-semibold">
            {complete
              ? "Everything's ready"
              : `${checks.length - ready} detail${checks.length - ready === 1 ? "" : "s"} missing`}
          </h3>
          <p className="text-[12px] text-muted-foreground">
            {complete
              ? `All the details ${STORE[platform].console} asks for are filled.`
              : "Missing ones are left for you to fill by hand — or add them now."}
          </p>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="mt-1 inline-flex items-center gap-1 text-[12px] font-medium text-foreground/80 hover:text-foreground"
          >
            {open ? "Hide details" : "Show details"}
            <ChevronDownIcon
              className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`}
            />
          </button>
        </div>
      </div>

      {open && (
        <>
          <ul className="mt-4 grid grid-cols-2 gap-1.5">
            {checks.map((c, i) => (
              <li
                key={c.label}
                className={`tracker-rise flex items-center gap-2 rounded-lg border px-2.5 py-2 text-[12px] ${
                  c.ok
                    ? "border-transparent bg-muted/50"
                    : c.required
                      ? "border-bad/40 bg-bad-soft"
                      : "border-dashed"
                }`}
                style={{ animationDelay: `${i * 35}ms` }}
              >
                <span
                  className={`grid size-4 shrink-0 place-items-center rounded-full ${
                    c.ok
                      ? "bg-[var(--st-production)] text-white"
                      : c.required
                        ? "bg-[var(--st-rejected)] text-white"
                        : "border border-muted-foreground/40"
                  }`}
                >
                  {c.ok ? (
                    <CheckIcon
                      className="pub-pop size-2.5"
                      strokeWidth={3.5}
                      style={{ animationDelay: `${150 + i * 35}ms` }}
                    />
                  ) : c.required ? (
                    <XIcon className="size-2.5" strokeWidth={3.5} />
                  ) : null}
                </span>
                <span className={`truncate ${c.ok ? "" : "font-medium"}`}>{c.label}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <ListingDialog
              product={product}
              platform={platform}
              trigger="Edit app listing"
              className="btn btn-secondary h-8 text-[12px]"
            />
            <ClientPlayDialog
              client={client}
              trigger={STORE[platform].clientButton}
              className="btn btn-secondary h-8 text-[12px]"
            />
          </div>
        </>
      )}
    </section>
  );
}

/** A circular gauge that sweeps up to its value when it appears. */
function Ring({ value, total, size = 56 }: { value: number; total: number; size?: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setShown(value), 60);
    return () => clearTimeout(t);
  }, [value]);

  const r = size / 2 - 5;
  const circumference = 2 * Math.PI * r;
  const pct = total ? shown / total : 0;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="5" className="stroke-muted" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth="5"
          strokeLinecap="round"
          stroke={value === total ? "var(--st-production)" : "var(--st-in-review)"}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct)}
          style={{ transition: "stroke-dashoffset 0.9s cubic-bezier(0.2, 0.7, 0.2, 1)" }}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-[14px] font-semibold tabular-nums">
        {value}/{total}
      </span>
    </div>
  );
}

// ──────────────────────────────────────────────── account and toggle ──

function AccountCard({ accountName, platform }: { accountName: string; platform: Platform }) {
  return (
    <section
      className="tracker-rise flex items-start gap-3 rounded-2xl border bg-card p-4 shadow-xs"
      style={{ animationDelay: "80ms" }}
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-info-soft text-info">
        <ShieldCheckIcon className="size-4" />
      </span>
      <div className="min-w-0 text-[12px] leading-relaxed">
        <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
          {STORE[platform].accountLabel}
        </p>
        <p className="truncate text-[14px] font-semibold text-foreground">
          {accountName || "Not set"}
        </p>
        <p className="text-muted-foreground">
          {STORE[platform].accountNote}
        </p>
      </div>
    </section>
  );
}

function Toggle({
  checked,
  onChange,
  title,
  detail,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  title: string;
  detail: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`tracker-rise flex w-full items-start gap-3 rounded-2xl border p-4 text-left shadow-xs transition-colors ${
        checked ? "border-[var(--st-production)]/50 bg-good-soft" : "bg-card hover:border-ring/60"
      }`}
      style={{ animationDelay: "140ms" }}
    >
      <span
        className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${
          checked ? "bg-[var(--st-production)]" : "bg-muted-foreground/30"
        }`}
      >
        <span
          className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-[18px]" : "translate-x-0.5"
          }`}
        />
      </span>
      <span className="min-w-0 text-[12px] leading-relaxed">
        <span className="block text-[14px] font-semibold text-foreground">{title}</span>
        <span className="text-muted-foreground">{detail}</span>
      </span>
    </button>
  );
}

function LaunchButton({
  disabled,
  launching,
  onClick,
  label,
}: {
  disabled: boolean;
  launching: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`group relative flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl text-[16px] font-semibold text-white shadow-md transition-all disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none ${
        disabled ? "" : "pub-shine hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0"
      }`}
      style={{
        background:
          "linear-gradient(135deg, var(--st-production), color-mix(in oklch, var(--st-production) 55%, var(--st-ongoing)))",
      }}
    >
      <RocketIcon
        className={`size-5 transition-transform ${
          launching ? "pub-launch" : "group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
        }`}
      />
      {launching ? "Launching…" : label}
    </button>
  );
}

// ─────────────────────────────────────────────────────────── progress ──

function RunSummary({
  run,
  consoleName,
  consoleUrl,
  next,
  noun,
  onContinue,
  onStop,
  onReset,
}: {
  run: PublisherState;
  consoleName: string;
  consoleUrl: string;
  /** What's left to do by hand once the run is done (the default is a first publish's). */
  next?: string;
  noun: string;
  onContinue: () => void;
  onStop: () => void;
  onReset: () => void;
}) {
  const { phase, steps, pauseMessage, logs } = run;
  const done = steps.filter((s) => s.status === "done").length;
  const failed = steps.filter((s) => s.status === "failed").length;
  const finished = phase === "done";
  const allGood = finished && failed === 0 && done === steps.length;
  // Open by default: in the wide popup there's room to watch it work.
  const [showLog, setShowLog] = useState(true);

  // Time since the run started (its first log line), ticking while it runs.
  const startedAt = logs[0]?.at;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (finished) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [finished]);
  const endAt = finished ? (logs.at(-1)?.at ?? now) : now;
  const elapsed = startedAt ? Math.max(0, Math.round((endAt - startedAt) / 1000)) : 0;

  return (
    <section className="space-y-4">
      <div className="tracker-rise relative overflow-hidden rounded-2xl border bg-card p-4 shadow-xs">
        {allGood && <Confetti />}
        <div className="flex items-center gap-4">
          <Ring value={done} total={steps.length} size={64} />
          <div className="min-w-0 flex-1">
            <h3 className="flex items-center gap-2 text-[16px] font-semibold">
              {allGood ? (
                <>
                  <PartyPopperIcon className="size-4 text-good" /> All {steps.length} {noun} done
                </>
              ) : finished ? (
                `Finished — ${failed} need${failed === 1 ? "s" : ""} you`
              ) : phase === "paused" ? (
                "Waiting for you"
              ) : phase === "starting" ? (
                `Opening ${consoleName}…`
              ) : (
                `Working in ${consoleName}…`
              )}
            </h3>
            <p className="text-[12px] tabular-nums text-muted-foreground">
              {done} done{failed ? ` · ${failed} failed` : ""} · {formatElapsed(elapsed)}
            </p>
          </div>
          {!finished && (
            <button type="button" className="btn btn-ghost h-8 text-bad" onClick={onStop}>
              Stop
            </button>
          )}
        </div>
      </div>

      {phase === "paused" && (
        <div className="pub-attention tracker-rise rounded-2xl border border-warn/50 bg-warn-soft p-4">
          <p className="flex items-center gap-2 text-[14px] font-semibold">
            <PauseIcon className="size-4 text-warn" /> {pauseMessage || "The run is paused."}
          </p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Do it in the {consoleName} tab, then continue.
          </p>
          <button type="button" className="btn btn-primary mt-3 h-8" onClick={onContinue}>
            Continue
          </button>
        </div>
      )}

      {logs.length > 0 && (
        <div className="rounded-2xl border bg-card">
          <div className="flex items-center justify-between px-3.5 py-2">
            <button
              type="button"
              onClick={() => setShowLog((v) => !v)}
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-foreground/80 hover:text-foreground"
            >
              <TerminalIcon className="size-3.5" /> Activity log
              <ChevronDownIcon
                className={`size-3.5 transition-transform ${showLog ? "rotate-180" : ""}`}
              />
            </button>
            <CopyReportButton
              report={logs.map((l) => l.msg).join("\n")}
              label="Copy log"
              className="btn btn-ghost h-7 px-2 text-[12px]"
            />
          </div>
          {showLog && (
            <pre className="max-h-[min(420px,45dvh)] overflow-y-auto whitespace-pre-wrap border-t bg-[oklch(0.2_0.006_260)] p-3.5 font-mono text-[12px] leading-relaxed text-[oklch(0.85_0.02_150)]">
              {logs
                .slice(-40)
                .map((l) => l.msg)
                .join("\n")}
            </pre>
          )}
        </div>
      )}

      {finished && (
        <div className="tracker-rise space-y-2">
          <div className="flex flex-wrap gap-2">
            <a href={consoleUrl} target="_blank" rel="noreferrer" className="btn btn-primary h-9">
              Open {consoleName} <ExternalLinkIcon className="size-3.5" />
            </a>
            <button type="button" className="btn btn-ghost h-9" onClick={onReset}>
              Clear run
            </button>
          </div>
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            {next ??
              "Next, by hand: review every section, upload the AAB under Release → Production (or Internal testing first), add release notes, and submit for review."}
          </p>
        </div>
      )}
    </section>
  );
}

/** The sections as a vertical timeline: a preview before the run, live during it. */
function Timeline({
  steps,
  live,
  footnote,
  noun = "sections",
}: {
  steps: PublisherStep[];
  live: boolean;
  footnote: string;
  noun?: string;
}) {
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-[14px] font-semibold">
          {live ? "Progress" : `${noun === "steps" ? "What it does" : "What gets filled"} · ${steps.length} ${noun}`}
        </h3>
        {!live && (
          <span className="text-[12px] text-muted-foreground">in this order</span>
        )}
      </div>
      <ol className="relative">
        {steps.map((s, i) => {
          const last = i === steps.length - 1;
          const settled = s.status === "done" || s.status === "failed";
          return (
            <li key={s.name} className="relative flex gap-3 pb-3 last:pb-0">
              {!last && (
                <span
                  aria-hidden
                  className="absolute left-[11px] top-6 h-[calc(100%-12px)] w-0.5 overflow-hidden rounded-full bg-border"
                >
                  <span
                    className="absolute inset-x-0 top-0 bg-[var(--st-production)] transition-[height] duration-500"
                    style={{ height: settled ? "100%" : "0%" }}
                  />
                </span>
              )}
              <span className="relative z-10 grid size-6 shrink-0 place-items-center">
                {s.status === "done" ? (
                  <span className="pub-pop grid size-6 place-items-center rounded-full bg-[var(--st-production)] text-white">
                    <CheckIcon className="size-3.5" strokeWidth={3} />
                  </span>
                ) : s.status === "failed" ? (
                  <span className="pub-pop grid size-6 place-items-center rounded-full bg-[var(--st-rejected)] text-white">
                    <XIcon className="size-3.5" strokeWidth={3} />
                  </span>
                ) : s.status === "running" ? (
                  <span className="grid size-6 place-items-center rounded-full border-2 border-foreground/15 bg-card">
                    <Loader2Icon className="size-4 animate-spin" />
                  </span>
                ) : (
                  <span className="grid size-6 place-items-center rounded-full border-2 bg-card text-[11px] font-semibold text-muted-foreground">
                    {i + 1}
                  </span>
                )}
              </span>
              <div
                className={`min-w-0 flex-1 rounded-xl px-3 py-1.5 transition-colors ${
                  s.status === "running" ? "bg-muted" : ""
                }`}
              >
                <p
                  className={`text-[14px] ${
                    s.status === "pending" ? "text-muted-foreground" : "font-medium"
                  }`}
                >
                  {s.name}
                </p>
                {s.status === "running" && (
                  <p className="text-[12px] text-muted-foreground">Working on it…</p>
                )}
                {s.error && (
                  <p className="tracker-rise mt-0.5 text-[12px] leading-snug text-bad">{s.error}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {!live && (
        <p className="mt-4 rounded-xl border border-dashed bg-card px-3.5 py-2.5 text-[12px] leading-relaxed text-muted-foreground">
          {footnote}
        </p>
      )}
    </section>
  );
}

/** A short burst of confetti from the headline card when every step passed. */
function Confetti() {
  const colors = [
    "var(--st-production)",
    "var(--st-ongoing)",
    "var(--st-in-review)",
    "var(--st-on-hold)",
    "var(--st-closed-testing)",
  ];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {Array.from({ length: 26 }, (_, i) => {
        const angle = (i / 26) * Math.PI * 2;
        const distance = 70 + (i % 5) * 18;
        return (
          <span
            key={i}
            className="pub-confetti absolute left-12 top-10 h-2 w-1 rounded-sm"
            style={
              {
                background: colors[i % colors.length],
                "--dx": `${Math.cos(angle) * distance}px`,
                "--dy": `${Math.sin(angle) * distance * 0.7 + 30}px`,
                "--rot": `${(i % 2 ? 1 : -1) * (180 + i * 20)}deg`,
                animationDelay: `${(i % 4) * 40}ms`,
              } as React.CSSProperties
            }
          />
        );
      })}
    </div>
  );
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
}

// ─────────────────────────────────────────────────────── extension ──

function ExtensionStatus({
  installed,
  stale,
  version,
}: {
  installed: boolean | null;
  stale: boolean;
  version: string | null;
}) {
  if (stale) {
    return (
      <section className="tracker-rise rounded-2xl border border-warn/40 bg-warn-soft p-4 text-[12px]">
        <p className="flex items-center gap-2 font-semibold text-warn">
          <PuzzleIcon className="size-4" /> The publisher extension was updated
        </p>
        <p className="mt-1 text-foreground/80">Reload this page to reconnect to the new version.</p>
        <button
          type="button"
          className="btn btn-secondary mt-2.5 h-8"
          onClick={() => window.location.reload()}
        >
          Reload page
        </button>
      </section>
    );
  }
  if (installed === null) {
    return (
      <p className="flex items-center gap-2 text-[12px] text-muted-foreground">
        <Loader2Icon className="size-3.5 animate-spin" /> Looking for the publisher extension…
      </p>
    );
  }
  if (installed) {
    return (
      <p className="inline-flex items-center gap-1.5 rounded-full bg-good-soft px-2.5 py-1 text-[12px] font-medium text-good">
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--st-production)] opacity-60" />
          <span className="relative inline-flex size-1.5 rounded-full bg-[var(--st-production)]" />
        </span>
        Extension connected{version ? ` · v${version}` : ""}
      </p>
    );
  }
  return (
    <section className="tracker-rise rounded-2xl border border-bad/30 bg-bad-soft p-4 text-[12px]">
      <p className="flex items-center gap-2 font-semibold text-bad">
        <AlertTriangleIcon className="size-4" /> Publisher extension not found
      </p>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-foreground/80">
        <li>
          Open <span className="font-mono">chrome://extensions</span> and turn on Developer mode
        </li>
        <li>
          <span className="font-medium">Load unpacked</span> → choose the{" "}
          <span className="font-mono">app-publishing-bot/extension</span> folder
        </li>
        <li>Reload this page</li>
      </ol>
      <p className="mt-2 text-muted-foreground">Chrome on a desktop only.</p>
    </section>
  );
}
