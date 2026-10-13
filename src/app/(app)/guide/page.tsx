import type { ReactNode } from "react";
import {
  PuzzleIcon,
  RocketIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  RadarIcon,
  KeyRoundIcon,
  ClipboardListIcon,
  LifeBuoyIcon,
  LayersIcon,
  InfoIcon,
  LayoutDashboardIcon,
  StoreIcon,
  Building2Icon,
  SmartphoneIcon,
  ArrowRightIcon,
  ArrowDownIcon,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";

const SECTIONS = [
  { id: "overview", label: "Overview", Icon: InfoIcon },
  { id: "model", label: "How it's organised", Icon: LayersIcon },
  { id: "extension", label: "Install the extension", Icon: PuzzleIcon },
  { id: "publish", label: "Publish an app", Icon: RocketIcon },
  { id: "update", label: "Update an app", Icon: RefreshCwIcon },
  { id: "data-safety", label: "Data safety", Icon: ShieldCheckIcon },
  { id: "store-watch", label: "Store status", Icon: RadarIcon },
  { id: "keystores", label: "Keystores", Icon: KeyRoundIcon },
  { id: "intake", label: "Client intake form", Icon: ClipboardListIcon },
  { id: "help", label: "Getting help", Icon: LifeBuoyIcon },
] as const;

export default function GuidePage() {
  return (
    <>
      <PageHeader title="Guide" meta="How Publish Tracker and the publishing extension work, end to end." />

      <div className="flex gap-10">
        <article className="min-w-0 max-w-3xl flex-1 space-y-12 pb-16">
          <Section id="overview" title="Overview" Icon={InfoIcon}>
            <P>
              Publish Tracker is where the team keeps every client app&apos;s journey to the Play
              Store and App Store — who&apos;s working on it, what stage it&apos;s at, and the
              credentials and details each store needs. The companion Chrome extension,{" "}
              <B>Play Console Publisher</B>, does the repetitive form-filling in Play Console and
              App Store Connect for you.
            </P>
            <P>Think of it as two halves working together:</P>
            <ul className="ml-1 space-y-2">
              <Bullet>
                <B>The tracker</B> (this app) — the record of clients, apps, releases, store
                accounts, keystores and status.
              </Bullet>
              <Bullet>
                <B>The extension</B> — runs in your own signed-in Chrome and fills the store forms
                when you click Publish, using the app details from the tracker.
              </Bullet>
            </ul>
            <FlowDiagram />
          </Section>

          <Section id="model" title="How it's organised" Icon={LayersIcon}>
            <P>A few ideas, from the top down:</P>
            <ul className="ml-1 space-y-2">
              <Bullet>
                <B>Client</B> — one engagement, tied to a support ticket. Owns everything below.
              </Bullet>
              <Bullet>
                <B>Store account</B> — the client&apos;s Play / Apple developer account. Stays the
                same across every round.
              </Bullet>
              <Bullet>
                <B>App</B> — a permanent app you publish for the client (User, Store, Delivery…),
                set up once. Each app carries its own version.
              </Bullet>
              <Bullet>
                <B>Release</B> — a round of work: a first launch or an update, with a title or just
                its date, covering whichever apps you touched that round.
              </Bullet>
            </ul>
            <ModelDiagram />
            <Callout>
              A release is a <B>round of work</B>, not a version. The version lives on each app —
              that&apos;s why the board shows each app at its own latest version.
            </Callout>
          </Section>

          <Section id="extension" title="Install the Chrome extension" Icon={PuzzleIcon}>
            <P>
              The extension is loaded into your own Chrome once. It runs only on Play Console and
              App Store Connect, acting as you, in your signed-in session.
            </P>
            <BrowserMock />
            <Steps>
              <Step n={1}>
                Open <Code>chrome://extensions</Code> and turn on <B>Developer mode</B> (top-right).
              </Step>
              <Step n={2}>
                Click <B>Load unpacked</B> and choose the <Code>extension</Code> folder you were
                given. It appears as <B>Play Console Publisher</B>.
              </Step>
              <Step n={3}>
                Sign in to <B>Play Console</B> and <B>App Store Connect</B> in that same Chrome
                profile — the extension works through your logins.
              </Step>
              <Step n={4}>
                Pin the extension if you like, so its popup is one click away.
              </Step>
            </Steps>
            <Callout>
              After an update to the extension, return to <Code>chrome://extensions</Code> and click{" "}
              <B>Reload</B> on it so the new version loads.
            </Callout>
          </Section>

          <Section id="publish" title="Publish an app" Icon={RocketIcon}>
            <P>First-time publishing of a client app, from nothing to submitted:</P>
            <Steps>
              <Step n={1}>
                <B>Create the client</B> and add its store account(s) — the Play / Apple developer
                account name and how the team gets in (invite or shared login).
              </Step>
              <Step n={2}>
                <B>Set up the apps.</B> For each app, open its <B>Listing</B> and fill the package
                name / bundle ID, store listing, categories and the review demo account.
              </Step>
              <Step n={3}>
                <B>Attach the keystore</B> (for Android) so the build can be signed.
              </Step>
              <Step n={4}>
                Open the app&apos;s side drawer and click <B>Publish</B>. The extension opens the
                console and fills the forms; you review and submit.
              </Step>
            </Steps>
            <Callout>
              Missing details (like a package name) are flagged before you publish — the drawer and
              Listing show what still needs filling.
            </Callout>
          </Section>

          <Section id="update" title="Update an app" Icon={RefreshCwIcon}>
            <P>
              When a client&apos;s app is already live, publishing again becomes an <B>update</B>.
            </P>
            <Steps>
              <Step n={1}>
                Start a <B>New release</B> (a round) and pick only the apps that are changing — each
                carries its own next version.
              </Step>
              <Step n={2}>
                From the app, click <B>Update</B>. The extension creates the new version in the
                store and fills what it can; you attach the build and submit.
              </Step>
            </Steps>
          </Section>

          <Section id="data-safety" title="Data safety" Icon={ShieldCheckIcon}>
            <P>
              Play&apos;s Data safety form is the same for every 6amTech app — only the
              account-deletion URL changes. The extension handles it automatically.
            </P>
            <Steps>
              <Step n={1}>
                During a Play publish, the extension reaches the <B>Data safety</B> section and uses{" "}
                <B>Import from CSV</B> with a bundled template.
              </Step>
              <Step n={2}>
                It drops in that client&apos;s delete-account URL, confirms the import, and saves —
                no manual form filling.
              </Step>
            </Steps>
            <Callout>
              If Google ever changes the Import flow, the extension falls back to filling the form
              control by control, so publishing keeps working.
            </Callout>
          </Section>

          <Section id="store-watch" title="Store status (Store Watch)" Icon={RadarIcon}>
            <P>
              Store Watch checks each app&apos;s public store page and records whether it&apos;s
              live and at which version — so you can see when a submission has gone live.
            </P>
            <ul className="ml-1 space-y-2">
              <Bullet>
                It runs hourly in the background, and you can run it anytime with{" "}
                <B>Sync store status</B> on the board, or <B>Check now</B> on one app.
              </Bullet>
              <Bullet>
                Play is read from the public page; the App Store is read from Apple&apos;s API,
                across storefronts (so apps live only in one country are still found).
              </Bullet>
              <Bullet>
                When the store is ahead of the tracker, it adopts the store&apos;s version — your
                recorded version stays in step with reality.
              </Bullet>
            </ul>
            <Callout>
              Apple&apos;s API lags the store by up to a day for brand-new apps, so a just-released
              iOS app may take a few hours to show up.
            </Callout>
          </Section>

          <Section id="keystores" title="Keystores" Icon={KeyRoundIcon}>
            <P>
              A client&apos;s Android signing keystore lives on the client, and every app of that
              client links to it — so one place holds the key, and builds sign consistently.
            </P>
            <ul className="ml-1 space-y-2">
              <Bullet>The <Code>.jks</Code> file is stored privately and downloaded only by signed-in team members.</Bullet>
              <Bullet>Key details (alias, passwords) are kept alongside it for signing.</Bullet>
            </ul>
          </Section>

          <Section id="intake" title="Client intake form" Icon={ClipboardListIcon}>
            <P>
              Instead of chasing clients for details over chat, send them a private intake link.
              They fill in their business info, store accounts, app listings and image links.
            </P>
            <ul className="ml-1 space-y-2">
              <Bullet>
                Open a client, use <B>Client form</B> to get their private link, and share it.
              </Bullet>
              <Bullet>
                On the form, <B>Auto-fill from website</B> reads their site to pre-fill contact and
                policy details, and each app can pull your <B>standard description</B> in one click.
              </Bullet>
              <Bullet>What they submit flows straight onto the client, ready to publish.</Bullet>
            </ul>
          </Section>

          <Section id="help" title="Getting help" Icon={LifeBuoyIcon}>
            <P>
              Hit a store rejection or a snag? The <B>Support</B> section is the team&apos;s
              playbook of common issues and fixes — add a new one whenever you solve something, so
              nobody figures it out twice.
            </P>
          </Section>
        </article>

        <nav className="sticky top-6 hidden h-max w-48 shrink-0 lg:block">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            On this page
          </p>
          <ul className="space-y-0.5 border-l border-border">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="-ml-px flex items-center gap-2 border-l border-transparent py-1 pl-3 text-[13px] text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
                >
                  <s.Icon className="size-3.5 shrink-0" />
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </>
  );
}

function FlowNode({
  Icon,
  title,
  sub,
}: {
  Icon: typeof InfoIcon;
  title: string;
  sub: string;
}) {
  return (
    <div className="flex flex-1 items-center gap-3 rounded-xl border border-border bg-muted/20 px-4 py-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-background text-foreground/70 ring-1 ring-border">
        <Icon className="size-[18px]" />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-foreground">{title}</span>
        <span className="block text-[12px] text-muted-foreground">{sub}</span>
      </span>
    </div>
  );
}

function FlowArrow({ label }: { label: string }) {
  return (
    <div className="flex shrink-0 items-center justify-center gap-1 px-1 text-muted-foreground sm:flex-col sm:px-2">
      <ArrowDownIcon className="size-4 sm:hidden" />
      <ArrowRightIcon className="hidden size-4 sm:block" />
      <span className="text-[10px] uppercase tracking-wide">{label}</span>
    </div>
  );
}

function FlowDiagram() {
  return (
    <div className="mt-2 flex flex-col items-stretch gap-2 rounded-2xl border border-border bg-card/40 p-4 sm:flex-row sm:items-center">
      <FlowNode Icon={LayoutDashboardIcon} title="Publish Tracker" sub="clients · apps · status" />
      <FlowArrow label="app details" />
      <FlowNode Icon={PuzzleIcon} title="Extension" sub="fills the forms" />
      <FlowArrow label="submits" />
      <FlowNode Icon={StoreIcon} title="Play / App Store" sub="live" />
    </div>
  );
}

function ModelRow({
  Icon,
  title,
  sub,
  tag,
  depth = 0,
}: {
  Icon: typeof InfoIcon;
  title: string;
  sub: string;
  tag?: string;
  depth?: number;
}) {
  return (
    <div className="flex items-center gap-3" style={{ paddingLeft: depth * 24 }}>
      {depth > 0 && <span className="h-px w-3 shrink-0 bg-border" />}
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-foreground/70">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-[13px] font-semibold text-foreground">{title}</span>
        <span className="ml-2 text-[12px] text-muted-foreground">{sub}</span>
      </span>
      {tag && (
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
          {tag}
        </span>
      )}
    </div>
  );
}

function ModelDiagram() {
  return (
    <div className="mt-2 space-y-2.5 rounded-2xl border border-border bg-card/40 p-4">
      <ModelRow Icon={Building2Icon} title="Client" sub="one engagement · #ticket" />
      <ModelRow depth={1} Icon={StoreIcon} title="Store account" sub="Play / Apple — stable" />
      <ModelRow depth={1} Icon={SmartphoneIcon} title="App" sub="set up once" tag="its own version" />
      <ModelRow depth={1} Icon={LayersIcon} title="Release" sub="a round of work" tag="title or date" />
    </div>
  );
}

function BrowserMock() {
  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-2">
        <span className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-muted-foreground/30" />
          <span className="size-2.5 rounded-full bg-muted-foreground/30" />
          <span className="size-2.5 rounded-full bg-muted-foreground/30" />
        </span>
        <span className="ml-2 flex-1 rounded-md bg-background px-3 py-1 font-mono text-[12px] text-muted-foreground">
          chrome://extensions
        </span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
        <span className="text-[13px] font-medium text-foreground">Extensions</span>
        <span className="flex items-center gap-2 text-[12px] text-muted-foreground">
          Developer mode
          <span className="flex h-4 w-7 items-center rounded-full bg-[var(--st-production)]/80 p-0.5">
            <span className="ml-auto size-3 rounded-full bg-white" />
          </span>
        </span>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-border bg-muted/20 px-4 py-3">
        <span className="rounded-md bg-foreground px-3 py-1.5 text-[12px] font-medium text-background ring-2 ring-[var(--st-ongoing)]/50">
          Load unpacked
        </span>
        <span className="rounded-md border border-border px-3 py-1.5 text-[12px] text-muted-foreground">
          Pack extension
        </span>
        <span className="rounded-md border border-border px-3 py-1.5 text-[12px] text-muted-foreground">
          Update
        </span>
      </div>
    </div>
  );
}

function Section({
  id,
  title,
  Icon,
  children,
}: {
  id: string;
  title: string;
  Icon: typeof InfoIcon;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-lg bg-muted text-foreground/70">
          <Icon className="size-4" />
        </span>
        <h2 className="text-[18px] font-semibold text-foreground">{title}</h2>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function P({ children }: { children: ReactNode }) {
  return <p className="text-[14px] leading-relaxed text-foreground/80">{children}</p>;
}

function B({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-foreground">{children}</strong>;
}

function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[12px] text-foreground/90">
      {children}
    </code>
  );
}

function Bullet({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-2.5 text-[14px] leading-relaxed text-foreground/80">
      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
      <span>{children}</span>
    </li>
  );
}

function Steps({ children }: { children: ReactNode }) {
  return <ol className="space-y-2.5">{children}</ol>;
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-foreground text-[12px] font-semibold text-background">
        {n}
      </span>
      <span className="pt-0.5 text-[14px] leading-relaxed text-foreground/80">{children}</span>
    </li>
  );
}

function Callout({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2.5 rounded-lg border border-border bg-muted/30 p-3.5">
      <InfoIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <p className="text-[13px] leading-relaxed text-foreground/80">{children}</p>
    </div>
  );
}
