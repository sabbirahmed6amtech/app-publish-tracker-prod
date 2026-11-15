"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/Modal";
import { Spinner } from "@/components/Spinner";
import { CodeEditor } from "@/components/CodeEditor";
import { KeyPropertiesButton } from "@/components/KeyPropertiesButton";
import { createClientSetup, type SetupApp } from "@/lib/actions";
import { ProjectLogo } from "@/components/ProjectLogo";
import { StoreIcon } from "@/components/StoreIcon";
import { ACCOUNT_TYPES, PLATFORMS } from "@/lib/constants";
import type { AccountType, LineBadge, Platform, ProductLine } from "@/lib/types";
import { startNavigation } from "@/components/NavigationProgress";

const STEPS = ["Client", "Stores", "Apps", "Keystore"] as const;
const PLATFORM_KEYS = Object.keys(PLATFORMS) as Platform[];

type Store = { enabled: boolean; accountName: string; accountType: AccountType };

/**
 * Sets up a client completely in one pass — client, store accounts, apps,
 * keystore — and starts its first release, so nobody has to visit four dialogs.
 */
export function NewClientWizard({
  lines,
  suggestions,
  trigger = "+ New client",
  className = "btn btn-primary",
}: {
  /** Product lines from Settings, offered as one-click app sets. */
  lines: ProductLine[];
  /** Project names to suggest when typing one in. */
  suggestions: string[];
  trigger?: string;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const [name, setName] = useState("");
  const [ticket, setTicket] = useState("");
  const [stores, setStores] = useState<Record<Platform, Store>>({
    play_store: { enabled: true, accountName: "", accountType: "organization" },
    app_store: { enabled: true, accountName: "", accountType: "organization" },
  });
  const [apps, setApps] = useState<SetupApp[]>([]);
  const [keystoreName, setKeystoreName] = useState("Main keystore");
  const [keystoreFile, setKeystoreFile] = useState<File | null>(null);
  const [details, setDetails] = useState("");
  const [detailsVersion, setDetailsVersion] = useState(0);
  const [startRelease, setStartRelease] = useState(true);

  const enabled = PLATFORM_KEYS.filter((p) => stores[p].enabled);
  const badges: Record<string, LineBadge> = {};
  for (const l of lines) for (const p of l.projects) badges[p] = { line: l.name, logo: l.logo_url };

  function reset() {
    setStep(0);
    setError(null);
    setName("");
    setTicket("");
    setStores({
      play_store: { enabled: true, accountName: "", accountType: "organization" },
      app_store: { enabled: true, accountName: "", accountType: "organization" },
    });
    setApps([]);
    setKeystoreName("Main keystore");
    setKeystoreFile(null);
    setDetails("");
    setStartRelease(true);
  }

  function addLine(projects: string[]) {
    setApps((list) => [
      ...list,
      ...projects
        .filter((p) => !list.some((a) => a.project_name === p))
        .map((project_name) => ({ project_name, app_name: "", stores: enabled })),
    ]);
  }

  function patchApp(i: number, patch: Partial<SetupApp>) {
    setApps((list) => list.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  }

  // Each step checks only what it asks for.
  function problem(): string | null {
    if (step === 0) {
      if (!name.trim()) return "Client name is required.";
      if (!ticket.trim()) return "Ticket number is required.";
    }
    if (step === 1 && enabled.length === 0) return "Pick at least one store.";
    if (step === 2) {
      if (apps.length === 0) return "Add at least one app.";
      if (apps.some((a) => !a.project_name.trim())) return "Every app needs a project.";
      if (apps.some((a) => !a.stores.some((p) => enabled.includes(p))))
        return "Every app needs at least one store.";
    }
    return null;
  }

  function next() {
    const p = problem();
    if (p) return setError(p);
    setError(null);
    setStep((s) => s + 1);
  }

  function create() {
    setError(null);
    const fd = new FormData();
    fd.set("name", name);
    fd.set("ticket", ticket);
    for (const p of PLATFORM_KEYS) {
      if (!stores[p].enabled) continue;
      fd.set(`${p}_enabled`, "1");
      fd.set(`${p}_account_name`, stores[p].accountName);
      fd.set(`${p}_account_type`, stores[p].accountType);
    }
    fd.set(
      "apps",
      JSON.stringify(
        apps.map((a) => ({ ...a, stores: a.stores.filter((p) => enabled.includes(p)) })),
      ),
    );
    fd.set("keystore_name", keystoreName);
    fd.set("keystore_details", details);
    if (keystoreFile) fd.set("keystore_file", keystoreFile);
    if (startRelease) fd.set("start_release", "1");

    start(async () => {
      const res = await createClientSetup(fd);
      if (!res.ok) return setError(res.error);
      toast.success(`${name} is set up${startRelease ? " and its first release has started" : ""}`);
      setOpen(false);
      reset();
      startNavigation(`/clients/${res.id}`);
      router.push(`/clients/${res.id}`);
      router.refresh();
    });
  }

  const productCount = apps.reduce(
    (n, a) => n + a.stores.filter((p) => enabled.includes(p)).length,
    0,
  );

  return (
    <>
      <button className={className} onClick={() => setOpen(true)}>
        {trigger}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New client"
        subtitle="Set it up once — every release after this is one click."
        width="max-w-2xl"
      >
        {/* step indicator */}
        <ol className="flex items-center gap-2 border-b px-5 py-3">
          {STEPS.map((label, i) => (
            <li key={label} className="flex items-center gap-2">
              <span
                className={`grid size-5 place-items-center rounded-full text-[12px] font-semibold ${
                  i < step
                    ? "bg-primary text-primary-foreground"
                    : i === step
                      ? "bg-foreground text-background"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {i < step ? <CheckIcon className="size-3" /> : i + 1}
              </span>
              <span
                className={`text-[12px] font-medium ${
                  i === step ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {label}
              </span>
              {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-border" />}
            </li>
          ))}
        </ol>

        <div className="space-y-4 px-5 py-4">
          {step === 0 && (
            <div className="grid grid-cols-[1fr_160px] gap-3">
              <div>
                <label className="label" htmlFor="wiz-name">
                  Client name
                </label>
                <input
                  id="wiz-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Anelissa"
                  className="field"
                  autoFocus
                />
              </div>
              <div>
                <label className="label" htmlFor="wiz-ticket">
                  Ticket
                </label>
                <input
                  id="wiz-ticket"
                  value={ticket}
                  onChange={(e) => setTicket(e.target.value)}
                  placeholder="12345"
                  className="field font-mono"
                />
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {PLATFORM_KEYS.map((p) => {
                const s = stores[p];
                const set = (patch: Partial<Store>) =>
                  setStores((all) => ({ ...all, [p]: { ...all[p], ...patch } }));
                return (
                  <div
                    key={p}
                    className={`rounded-xl border p-3 transition-colors ${
                      s.enabled ? "bg-card" : "bg-muted/40"
                    }`}
                  >
                    <label className="flex cursor-pointer items-center gap-2 text-[14px] font-semibold">
                      <input
                        type="checkbox"
                        checked={s.enabled}
                        onChange={(e) => set({ enabled: e.target.checked })}
                        className="size-4 accent-foreground"
                      />
                      <StoreIcon platform={p} size={15} />
                      {PLATFORMS[p].label}
                    </label>
                    {s.enabled && (
                      <div className="mt-3 space-y-2.5">
                        <div>
                          <label className="label" htmlFor={`wiz-${p}-name`}>
                            Developer account name
                          </label>
                          <input
                            id={`wiz-${p}-name`}
                            value={s.accountName}
                            onChange={(e) => set({ accountName: e.target.value })}
                            placeholder="As shown in the console"
                            className="field"
                          />
                        </div>
                        <div>
                          <label className="label" htmlFor={`wiz-${p}-type`}>
                            Account type
                          </label>
                          <select
                            id={`wiz-${p}-type`}
                            value={s.accountType}
                            onChange={(e) => set({ accountType: e.target.value as AccountType })}
                            className="field"
                          >
                            {Object.entries(ACCOUNT_TYPES).map(([value, meta]) => (
                              <option key={value} value={value}>
                                {meta.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {step === 2 && (
            <>
              <div>
                <p className="label">Add a product line</p>
                <div className="flex flex-wrap gap-1.5">
                  {lines
                    .filter((line) => line.projects.length > 0)
                    .map((line) => (
                      <button
                        key={line.id}
                        type="button"
                        className="btn btn-secondary h-8 pl-1.5 text-[12px]"
                        onClick={() => addLine(line.projects)}
                      >
                        <ProjectLogo
                          badge={{ line: line.name, logo: line.logo_url }}
                          project={line.name}
                          size="xs"
                        />
                        {line.name}
                        <span className="text-muted-foreground">{line.projects.length}</span>
                      </button>
                    ))}
                  <button
                    type="button"
                    className="btn btn-ghost h-7 text-[12px]"
                    onClick={() =>
                      setApps((list) => [
                        ...list,
                        { project_name: "", app_name: "", stores: enabled },
                      ])
                    }
                  >
                    <PlusIcon className="size-3.5" />
                    Custom app
                  </button>
                </div>
              </div>

              {apps.length === 0 ? (
                <p className="rounded-lg border border-dashed px-4 py-8 text-center text-[14px] text-muted-foreground">
                  Pick the product line this client bought, or add apps one by one.
                </p>
              ) : (
                <div className="overflow-hidden rounded-lg border">
                  <div className="grid grid-cols-[28px_1fr_1fr_auto_28px] gap-2 border-b bg-muted/50 px-3 py-1.5 text-[12px] font-medium text-muted-foreground">
                    <span />
                    <span>Project</span>
                    <span>Store listing name</span>
                    <span>Stores</span>
                    <span />
                  </div>
                  <datalist id="wiz-projects">
                    {suggestions.map((p) => (
                      <option key={p} value={p} />
                    ))}
                  </datalist>
                  {apps.map((a, i) => (
                    <div
                      key={i}
                      className="grid grid-cols-[28px_1fr_1fr_auto_28px] items-center gap-2 border-b px-3 py-2 last:border-0"
                    >
                      <ProjectLogo
                        badge={badges[a.project_name.trim()]}
                        project={a.project_name || "?"}
                      />
                      <input
                        value={a.project_name}
                        onChange={(e) => patchApp(i, { project_name: e.target.value })}
                        list="wiz-projects"
                        placeholder="Project"
                        aria-label="Project"
                        className="field h-8"
                      />
                      <input
                        value={a.app_name}
                        onChange={(e) => patchApp(i, { app_name: e.target.value })}
                        placeholder="e.g. ZippyGo"
                        aria-label="Store listing name"
                        className="field h-8"
                      />
                      <div className="flex gap-1">
                        {enabled.map((p) => {
                          const on = a.stores.includes(p);
                          return (
                            <button
                              key={p}
                              type="button"
                              aria-pressed={on}
                              onClick={() =>
                                patchApp(i, {
                                  stores: on ? a.stores.filter((x) => x !== p) : [...a.stores, p],
                                })
                              }
                              aria-label={PLATFORMS[p].label}
                              title={PLATFORMS[p].label}
                              className={`grid size-8 place-items-center rounded-md border transition ${
                                on
                                  ? "border-foreground bg-card ring-1 ring-foreground"
                                  : "opacity-35 grayscale hover:opacity-70"
                              }`}
                            >
                              <StoreIcon platform={p} size={15} />
                            </button>
                          );
                        })}
                      </div>
                      <button
                        type="button"
                        aria-label="Remove app"
                        className="btn btn-ghost size-7 px-0"
                        onClick={() => setApps((list) => list.filter((_, j) => j !== i))}
                      >
                        <Trash2Icon className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <p className="text-[14px] text-muted-foreground">
                Optional — skip it and add one later from the client&apos;s Credentials tab. It
                will be linked to every Play Store app.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="wiz-ks-name">
                    Name
                  </label>
                  <input
                    id="wiz-ks-name"
                    value={keystoreName}
                    onChange={(e) => setKeystoreName(e.target.value)}
                    className="field"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="wiz-ks-file">
                    JKS file
                  </label>
                  <input
                    id="wiz-ks-file"
                    type="file"
                    accept=".jks,.keystore,.p12"
                    onChange={(e) => setKeystoreFile(e.target.files?.[0] ?? null)}
                    className="field py-1 text-[12px] file:mr-2 file:rounded file:border-0 file:bg-muted file:px-2 file:py-0.5 file:text-[12px]"
                  />
                </div>
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="label mb-0">JKS details</span>
                  <KeyPropertiesButton
                    onLoad={(text) => {
                      setDetails(text);
                      setDetailsVersion((v) => v + 1);
                    }}
                  />
                </div>
                <CodeEditor
                  key={detailsVersion}
                  name="keystore_details_preview"
                  defaultValue={details}
                  onValueChange={setDetails}
                  placeholder={"storePassword=\nkeyPassword=\nkeyAlias=\nstoreFile="}
                  rows={4}
                />
              </div>
              <label className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2.5 text-[14px]">
                <input
                  type="checkbox"
                  checked={startRelease}
                  onChange={(e) => setStartRelease(e.target.checked)}
                  className="size-4 accent-foreground"
                />
                Start the first release now, assigned to me
              </label>
            </>
          )}

          {error && (
            <p className="rounded-md bg-destructive/10 px-2.5 py-2 text-[12px] text-destructive">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 border-t px-5 py-3">
          {step === 2 && productCount > 0 && (
            <span className="text-[12px] text-muted-foreground">
              {productCount} store {productCount === 1 ? "listing" : "listings"}
            </span>
          )}
          <div className="ml-auto flex gap-2">
            {step > 0 ? (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setError(null);
                  setStep((s) => s - 1);
                }}
              >
                Back
              </button>
            ) : (
              <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
                Cancel
              </button>
            )}
            {step < STEPS.length - 1 ? (
              <button type="button" className="btn btn-primary" onClick={next}>
                Continue
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                disabled={pending}
                onClick={create}
              >
                {pending ? (
                  <>
                    <Spinner /> Setting up…
                  </>
                ) : (
                  "Create client"
                )}
              </button>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
