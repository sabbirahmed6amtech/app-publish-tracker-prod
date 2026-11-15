"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const START_EVENT = "app:navigation-start";
const ACTIVITY_EVENT = "app:activity";
const GIVE_UP_MS = 20000;

type Tracked = Window & { __activityFetchPatched?: boolean; __activityPending?: number };

export function startNavigation(href: string) {
  const url = new URL(href, window.location.href);
  if (url.pathname + url.search === window.location.pathname + window.location.search) return;
  window.dispatchEvent(new Event(START_EVENT));
}

function isInternalNavigation(event: MouseEvent): boolean {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
  if (!anchor || anchor.hasAttribute("download")) return false;
  if (anchor.target && anchor.target !== "_self") return false;
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return false;
  if (url.pathname.startsWith("/api/")) return false;
  return url.pathname + url.search !== window.location.pathname + window.location.search;
}

function headersOf(input: RequestInfo | URL, init?: RequestInit): Headers {
  if (init?.headers) return new Headers(init.headers);
  if (input instanceof Request) return input.headers;
  return new Headers();
}

function isAppWork(input: RequestInfo | URL, init?: RequestInit): boolean {
  const headers = headersOf(input, init);
  if (headers.has("next-action")) return true;
  if (headers.get("rsc") !== "1") return false;
  return !headers.has("next-router-prefetch") && !headers.has("next-router-segment-prefetch");
}

function patchFetch() {
  const w = window as Tracked;
  if (w.__activityFetchPatched) return;
  w.__activityFetchPatched = true;
  w.__activityPending = 0;
  const original = window.fetch.bind(window);
  const change = (by: number) => {
    w.__activityPending = Math.max(0, (w.__activityPending ?? 0) + by);
    window.dispatchEvent(new Event(ACTIVITY_EVENT));
  };
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (!isAppWork(input, init)) return original(input, init);
    change(1);
    return original(input, init).finally(() => change(-1));
  };
}

export function NavigationProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(false);
  const running = useRef(false);
  const navigating = useRef(false);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const giveUp = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hide = useRef<ReturnType<typeof setTimeout> | null>(null);
  const first = useRef(true);

  const busy = () => navigating.current || ((window as Tracked).__activityPending ?? 0) > 0;

  const stopTimers = () => {
    if (tick.current) clearInterval(tick.current);
    if (giveUp.current) clearTimeout(giveUp.current);
    tick.current = null;
    giveUp.current = null;
  };

  const finish = () => {
    if (!running.current) return;
    running.current = false;
    stopTimers();
    setWidth(100);
    hide.current = setTimeout(() => {
      setVisible(false);
      setWidth(0);
    }, 250);
  };

  const begin = () => {
    if (running.current) return;
    if (hide.current) clearTimeout(hide.current);
    running.current = true;
    setVisible(true);
    setWidth(12);
    tick.current = setInterval(() => setWidth((w) => w + (90 - w) * 0.08), 200);
    giveUp.current = setTimeout(() => {
      navigating.current = false;
      finish();
    }, GIVE_UP_MS);
  };

  const sync = () => (busy() ? begin() : finish());

  useEffect(() => {
    patchFetch();
    const startNav = () => {
      navigating.current = true;
      sync();
    };
    const onClick = (event: MouseEvent) => {
      if (isInternalNavigation(event)) startNav();
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener(START_EVENT, startNav);
    window.addEventListener(ACTIVITY_EVENT, sync);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener(START_EVENT, startNav);
      window.removeEventListener(ACTIVITY_EVENT, sync);
      stopTimers();
      if (hide.current) clearTimeout(hide.current);
    };
  }, []);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    navigating.current = false;
    sync();
  }, [pathname, search]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[9999]">
      <div className="h-[3px]" style={{ opacity: visible ? 1 : 0, transition: "opacity 200ms ease" }}>
        <div
          className="h-full bg-primary shadow-[0_0_8px_var(--primary)]"
          style={{ width: `${width}%`, transition: "width 200ms ease" }}
        />
      </div>
      <div
        className="absolute right-3 top-2.5 size-4 animate-spin rounded-full motion-reduce:animate-none border-2 border-primary/25 border-t-primary"
        style={{ opacity: visible && width < 100 ? 1 : 0, transition: "opacity 200ms ease" }}
      />
    </div>
  );
}
