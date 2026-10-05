"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";
import { checkStoreNow } from "@/lib/actions";

/** Look this app up on its store now, instead of waiting for the hourly check. */
export function StoreCheckButton({
  productId,
  onNavigate,
}: {
  productId: string;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await checkStoreNow(productId);
          if (!res.ok) {
            if (res.needsPackageName && res.clientId) {
              const clientId = res.clientId;
              return void toast.error(res.error, {
                action: {
                  label: "Add it",
                  onClick: () => {
                    onNavigate?.();
                    router.push(`/clients/${clientId}?tab=apps`);
                  },
                },
              });
            }
            return void toast.error(res.error);
          }
          toast.success("Checked the store");
          router.refresh();
        })
      }
      className="btn btn-ghost h-7 gap-1 px-2 text-[12px]"
    >
      <RefreshCwIcon className={`size-3.5 ${pending ? "animate-spin" : ""}`} />
      {pending ? "Checking…" : "Check now"}
    </button>
  );
}
