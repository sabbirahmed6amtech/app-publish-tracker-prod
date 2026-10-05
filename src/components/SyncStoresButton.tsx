"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";
import { syncAllStores } from "@/lib/actions";

export function SyncStoresButton({ className = "btn btn-secondary" }: { className?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await syncAllStores();
          if (!res.ok) return void toast.error(res.error);
          if (res.checked === 0) {
            toast.info("No apps with a package name to check.");
          } else {
            toast.success(
              `Checked ${res.checked} ${res.checked === 1 ? "app" : "apps"} · ${res.live} live${
                res.updated ? ` · ${res.updated} version${res.updated === 1 ? "" : "s"} updated` : ""
              }${res.errors ? ` · ${res.errors} couldn't be reached` : ""}`,
            );
          }
          router.refresh();
        })
      }
      className={className}
    >
      <RefreshCwIcon className={`size-4 ${pending ? "animate-spin" : ""}`} />
      {pending ? "Syncing…" : "Sync store status"}
    </button>
  );
}
