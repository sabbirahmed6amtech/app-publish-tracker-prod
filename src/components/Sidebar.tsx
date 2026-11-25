"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BookOpenIcon,
  Building2Icon,
  ChartColumnIcon,
  KanbanIcon,
  LifeBuoyIcon,
  LogOutIcon,
  MailIcon,
  MenuIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PlusIcon,
  SettingsIcon,
  type LucideIcon,
} from "lucide-react";
import { PLATFORMS, RELEASE_STATES } from "@/lib/constants";
import { signOut } from "@/lib/actions";
import { ThemeToggle } from "@/components/ThemeToggle";
import { StoreIcon } from "@/components/StoreIcon";
import type { Platform, ReleaseState } from "@/lib/types";
import { BrandMark } from "@/components/BrandMark";
import { CopyButton } from "@/components/CopyButton";

export type SidebarRelease = {
  id: string;
  label: string;
  assignedTo: string | null;
  appCount: number;
  liveCount: number;
  state: ReleaseState;
};

export type SidebarClient = {
  id: string;
  ticket: string;
  name: string;
  platforms: Platform[];
  releases: SidebarRelease[];
};

const COLLAPSED_KEY = "sidebar:collapsed";

const NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/", label: "My work", icon: KanbanIcon },
  { href: "/clients", label: "Clients", icon: Building2Icon },
  { href: "/mail", label: "Store mail", icon: MailIcon },
  { href: "/reports", label: "Reports", icon: ChartColumnIcon },
  { href: "/guide", label: "Guide", icon: BookOpenIcon },
  { href: "/support", label: "Support", icon: LifeBuoyIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

export function Sidebar({
  clients,
  email,
  openMail = 0,
}: {
  clients: SidebarClient[];
  email: string | null;
  openMail?: number;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const close = () => setOpen(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSED_KEY) === "1");
    } catch {}
  }, []);

  const toggleCollapsed = () =>
    setCollapsed((value) => {
      try {
        window.localStorage.setItem(COLLAPSED_KEY, value ? "0" : "1");
      } catch {}
      return !value;
    });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "b" || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      const el = event.target as HTMLElement | null;
      if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) return;
      event.preventDefault();
      toggleCollapsed();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Inside a client, its release history joins the rail under the main nav.
  const clientMatch = pathname.match(/^\/clients\/([0-9a-f-]+)/i);
  const releaseMatch = pathname.match(/^\/releases\/([0-9a-f-]+)/i);

  const activeClient = clientMatch
    ? clients.find((c) => c.id === clientMatch[1])
    : releaseMatch
      ? clients.find((c) => c.releases.some((r) => r.id === releaseMatch[1]))
      : undefined;

  return (
    <>
      <div className="flex items-center gap-3 border-b bg-sidebar px-4 py-2.5 lg:hidden">
        <button
          className="btn btn-secondary size-8 px-0"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label="Menu"
        >
          <MenuIcon className="size-4" />
        </button>
        <BrandMark className="size-6" />
        <span className="text-[14px] font-semibold">Publish Tracker</span>
      </div>

      {open && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={close}
        />
      )}

      <aside
        className={`${open ? "fixed inset-y-0 left-0 z-50 block w-[85vw] max-w-[320px] overflow-y-auto shadow-xl" : "hidden"}
                    shrink-0 border-r bg-sidebar text-sidebar-foreground
                    lg:static lg:z-auto lg:block lg:max-w-none lg:overflow-visible lg:shadow-none
                    lg:transition-[width] lg:duration-200 motion-reduce:lg:transition-none
                    ${collapsed ? "lg:w-16" : "lg:w-[260px]"}`}
        data-collapsed={collapsed ? "true" : undefined}
      >
        <div className="flex h-full flex-col lg:sticky lg:top-0 lg:h-screen">
          <div className={`hidden h-14 items-center border-b lg:flex ${collapsed ? "justify-center px-2" : "gap-2.5 px-4"}`}>
            {collapsed ? (
              <button
                type="button"
                onClick={toggleCollapsed}
                aria-label="Expand sidebar"
                title="Expand sidebar (Ctrl/⌘ B)"
                className="group/brand grid size-9 place-items-center rounded-lg hover:bg-sidebar-accent"
              >
                <BrandMark className="size-7 group-hover/brand:hidden" />
                <PanelLeftOpenIcon className="hidden size-4 group-hover/brand:block" />
              </button>
            ) : (
              <>
                <BrandMark className="size-7" />
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="truncate text-[14px] font-semibold">Publish Tracker</div>
                  <div className="truncate text-[12px] text-muted-foreground">Store submissions</div>
                </div>
                <button
                  type="button"
                  onClick={toggleCollapsed}
                  aria-label="Collapse sidebar"
                  title="Collapse sidebar (Ctrl/⌘ B)"
                  className="btn btn-ghost size-8 px-0"
                >
                  <PanelLeftCloseIcon className="size-4" />
                </button>
              </>
            )}
          </div>

          <nav className="space-y-0.5 px-2 py-2">
            {NAV.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href) ||
                    (item.href === "/clients" && pathname.startsWith("/releases"));
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={close}
                  title={collapsed ? item.label : undefined}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[14px] font-medium
                              transition-colors ${collapsed ? "lg:justify-center lg:px-0" : ""} ${
                                active
                                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                                  : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground"
                              }`}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className={collapsed ? "lg:sr-only" : ""}>{item.label}</span>
                  {item.href === "/mail" && openMail > 0 && (
                    <span
                      className={`rounded-full bg-bad-soft px-1.5 text-[12px] font-semibold tabular-nums text-bad ${
                        collapsed ? "ml-auto lg:absolute lg:-right-0.5 lg:-top-1 lg:ml-0 lg:px-1 lg:text-[11px]" : "ml-auto"
                      }`}
                    >
                      {openMail}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {activeClient && collapsed && (
            <div className="hidden justify-center border-t px-2 py-3 lg:flex">
              <Link
                href={`/clients/${activeClient.id}`}
                title={`${activeClient.name} · Ticket #${activeClient.ticket}`}
                aria-label={`Open ${activeClient.name}`}
                className="grid size-9 place-items-center rounded-lg bg-primary text-[14px] font-semibold text-primary-foreground"
              >
                {initials(activeClient.name)}
              </Link>
            </div>
          )}

          {activeClient ? (
            <div className={`flex min-h-0 flex-1 flex-col ${collapsed ? "lg:hidden" : ""}`}>
              <ReleaseRail
                client={activeClient}
                activeReleaseId={releaseMatch?.[1]}
                onNavigate={close}
              />
            </div>
          ) : (
            <div className="flex-1" />
          )}
          {activeClient && collapsed && <div className="hidden flex-1 lg:block" />}

          <div className={`flex items-center justify-between border-t px-3 py-2 ${collapsed ? "lg:justify-center lg:px-2" : ""}`}>
            <span className={`text-[12px] font-medium text-muted-foreground ${collapsed ? "lg:hidden" : ""}`}>Theme</span>
            <ThemeToggle className={collapsed ? "lg:flex-col" : ""} />
          </div>

          {email && (
            <div className={`flex items-center gap-2.5 border-t px-3 py-2.5 ${collapsed ? "lg:flex-col lg:px-2" : ""}`}>
              <span
                className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-[12px] font-semibold uppercase"
                title={collapsed ? email : undefined}
              >
                {email.slice(0, 2)}
              </span>
              <span
                className={`min-w-0 flex-1 truncate text-[12px] text-muted-foreground ${collapsed ? "lg:hidden" : ""}`}
                title={email}
              >
                {email}
              </span>
              <form action={signOut}>
                <button
                  className="btn btn-ghost size-7 px-0"
                  aria-label="Sign out"
                  title="Sign out"
                >
                  <LogOutIcon className="size-3.5" />
                </button>
              </form>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

function ReleaseRail({
  client,
  activeReleaseId,
  onNavigate,
}: {
  client: SidebarClient;
  activeReleaseId?: string;
  onNavigate: () => void;
}) {
  const apps = client.releases.reduce((n, r) => n + r.appCount, 0);
  const live = client.releases.reduce((n, r) => n + r.liveCount, 0);

  return (
    <>
      <div className="border-t px-3 pb-3 pt-3">
        <div className="group relative rounded-xl border bg-background p-3 transition-colors hover:border-ring/60 has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/50">
          <Link
            href={`/clients/${client.id}`}
            onClick={onNavigate}
            aria-label={`Open ${client.name}`}
            className="absolute inset-0 rounded-xl outline-none"
          />
          <div className="pointer-events-none flex items-center gap-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-[14px] font-semibold text-primary-foreground">
              {initials(client.name)}
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-[14px] font-semibold">{client.name}</div>
              <div className="mt-0.5 font-mono text-[12px] text-muted-foreground">
                Ticket #{client.ticket}
              </div>
            </div>
            <CopyButton
              value={`${client.ticket} - ${client.name}`}
              label="Copy ticket and name"
              size={18}
              showStatusText={false}
              className="pointer-events-auto relative z-10 -mr-1 p-1.5"
            />
          </div>

          <div className="pointer-events-none mt-3 grid grid-cols-3 divide-x rounded-lg border bg-card text-center">
            <Stat value={client.releases.length} label="Releases" />
            <Stat value={apps} label="Apps" />
            <Stat value={live} label="Live" />
          </div>

          {client.platforms.length > 0 && (
            <div className="pointer-events-none mt-2.5 flex flex-wrap gap-1">
              {client.platforms.map((p) => (
                <span
                  key={p}
                  className="inline-flex items-center gap-1 rounded-md border bg-card px-1.5 py-0.5 text-[12px] font-medium text-muted-foreground"
                >
                  <StoreIcon platform={p} size={11} />
                  {PLATFORMS[p].label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between px-4 pb-1.5 pt-1">
        <span className="text-[12px] font-medium text-muted-foreground">Releases</span>
        <span className="text-[12px] text-muted-foreground">{client.releases.length}</span>
      </div>

      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
        {client.releases.length === 0 && (
          <p className="px-2.5 py-2 text-[12px] text-muted-foreground">No releases yet.</p>
        )}

        {client.releases.map((r) => {
          const active = r.id === activeReleaseId;
          const meta = RELEASE_STATES[r.state];

          return (
            <Link
              key={r.id}
              href={`/releases/${r.id}`}
              onClick={onNavigate}
              className={`block rounded-lg px-2.5 py-1.5 transition-colors ${
                active ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/70"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`size-2 shrink-0 rounded-full ${meta.dot}`} />
                <span className="truncate text-[14px] font-medium">{r.label}</span>
              </div>
              <div className="mt-0.5 truncate pl-4 text-[12px] text-muted-foreground">
                {r.appCount === 0
                  ? "No apps"
                  : `${r.appCount} ${r.appCount === 1 ? "app" : "apps"}`}
                {r.assignedTo ? ` · ${r.assignedTo}` : ""}
              </div>
            </Link>
          );
        })}
      </div>

      <div className="border-t px-3 py-2.5">
        <Link href={`/clients/${client.id}?new=release`} className="btn btn-secondary w-full">
          <PlusIcon className="size-4" /> New release
        </Link>
      </div>
    </>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="px-1 py-1.5">
      <div className="text-[14px] font-semibold tabular-nums">{value}</div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

/** "Anelissa" -> "AN", "Green Valley Foods" -> "GV". */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
