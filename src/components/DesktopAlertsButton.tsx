"use client";

import { useEffect, useState } from "react";
import { BellIcon, BellOffIcon, BellRingIcon } from "lucide-react";
import { toast } from "sonner";

type State = "unsupported" | "default" | "granted" | "denied";

export function DesktopAlertsButton() {
  const [state, setState] = useState<State>("default");

  useEffect(() => {
    setState("Notification" in window ? (Notification.permission as State) : "unsupported");
  }, []);

  if (state === "unsupported") return null;

  if (state === "granted") {
    return (
      <span className="inline-flex h-9 items-center gap-1.5 px-1 text-[12px] font-medium text-good">
        <BellRingIcon className="size-4" /> Desktop alerts on
      </span>
    );
  }

  if (state === "denied") {
    return (
      <span
        className="inline-flex h-9 items-center gap-1.5 px-1 text-[12px] text-muted-foreground"
        title="Notifications are blocked for this site. Allow them from the lock icon in the address bar."
      >
        <BellOffIcon className="size-4" /> Desktop alerts blocked
      </span>
    );
  }

  return (
    <button
      type="button"
      className="btn btn-secondary"
      onClick={async () => {
        const result = (await Notification.requestPermission()) as State;
        setState(result);
        if (result === "granted") {
          new Notification("Desktop alerts are on", {
            body: "You'll get a notification here when a new store ticket arrives.",
          });
        } else {
          toast.info("Desktop alerts stay off. In-app popups still show while the tracker is open.");
        }
      }}
    >
      <BellIcon className="size-4" /> Turn on desktop alerts
    </button>
  );
}
