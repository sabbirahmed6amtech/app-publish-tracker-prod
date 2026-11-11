"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MAIL_KINDS, ticketRef, type MailKind } from "@/lib/mailRules";

const POLL_MS = 45_000;
const SINCE_KEY = "apt_mail_alert_since";

type Alert = {
  id: string;
  number: number;
  kind: MailKind;
  subject: string;
  app_name: string | null;
  client_name: string | null;
  app_label: string | null;
  reopened: boolean | number;
  assigned_to_me: boolean | number;
};

function readSince(): string | null {
  try {
    return localStorage.getItem(SINCE_KEY);
  } catch {
    return null;
  }
}

function writeSince(value: string) {
  try {
    localStorage.setItem(SINCE_KEY, value);
  } catch {}
}

function titleOf(a: Alert): string {
  const app = a.app_name ? `${a.app_name}${a.client_name ? ` (${a.client_name})` : ""}` : a.app_label || "Unmatched";
  const kind = MAIL_KINDS[a.kind]?.label ?? "Notice";
  const lead = a.assigned_to_me ? "Assigned to you:" : a.reopened ? "Reopened" : "New";
  return `${lead} ${ticketRef(a.number)} · ${kind} · ${app}`;
}

export function MailAlerts() {
  const router = useRouter();
  const memorySince = useRef<string | null>(null);

  useEffect(() => {
    let stopped = false;

    async function poll() {
      if (stopped) return;
      const since = readSince() ?? memorySince.current;
      try {
        const res = await fetch(`/api/mail/alerts${since ? `?since=${encodeURIComponent(since)}` : ""}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { now: string; tickets: Alert[] };
        const current = readSince() ?? memorySince.current;
        if (current && current !== since && current >= data.now) return;
        memorySince.current = data.now;
        writeSince(data.now);
        if (!since || data.tickets.length === 0) return;

        for (const a of [...data.tickets].reverse()) {
          const title = titleOf(a);
          const open = () => router.push(`/mail/${a.number}`);
          toast[a.assigned_to_me ? "info" : "warning"](title, {
            id: `ticket-${a.id}`,
            description: a.subject,
            duration: 20_000,
            action: { label: "Open", onClick: open },
          });
          if (document.hidden && "Notification" in window && Notification.permission === "granted") {
            const n = new Notification(title, { body: a.subject, tag: `ticket-${a.id}` });
            n.onclick = () => {
              window.focus();
              open();
              n.close();
            };
          }
        }
        router.refresh();
      } catch {}
    }

    poll();
    const timer = setInterval(poll, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  return null;
}
