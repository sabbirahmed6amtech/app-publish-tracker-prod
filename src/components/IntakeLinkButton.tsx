"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardListIcon, ExternalLinkIcon } from "lucide-react";
import { toast } from "sonner";
import { CopyButton } from "@/components/CopyButton";
import { Spinner } from "@/components/Spinner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { createIntakeLink, disableIntakeLink } from "@/lib/actions";

/**
 * The client's private intake-form link: create it, copy it to send, replace
 * it (the old one stops working) or turn it off.
 */
export function IntakeLinkButton({
  clientId,
  token,
  submittedAt,
}: {
  clientId: string;
  token: string | null;
  submittedAt: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [origin, setOrigin] = useState("");
  const [confirming, setConfirming] = useState<"new" | "off" | null>(null);
  useEffect(() => setOrigin(window.location.origin), []);
  const url = token ? `${origin}/intake/${token}` : "";

  function run(action: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    start(async () => {
      const res = await action();
      if (!res.ok) {
        toast.error(res.error ?? "Something went wrong");
        return;
      }
      toast.success(done);
      router.refresh();
    });
  }

  return (
    <Popover>
      <PopoverTrigger className="btn btn-secondary relative">
        <ClipboardListIcon className="size-4" /> Client form
        {submittedAt && (
          <span
            className="absolute -right-1 -top-1 size-2.5 rounded-full bg-good ring-2 ring-background"
            aria-label="The client has filled it in"
          />
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] p-0">
        <div className="border-b px-4 py-3">
          <h3 className="text-[14px] font-semibold">Client form</h3>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            A private link where the client fills in their store details, each app&apos;s
            listing and a reviewer login. No login needed; what they save goes straight into
            this client&apos;s details.
          </p>
        </div>

        <div className="space-y-3 px-4 py-3">
          {token ? (
            <>
              <div className="flex items-center gap-1 rounded-md border bg-muted/40 py-1 pl-2.5 pr-1">
                <span className="min-w-0 flex-1 truncate font-mono text-[12px]">{url}</span>
                <CopyButton value={url} label="Copy link" />
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Open the form"
                  className="btn btn-ghost size-7 px-0"
                >
                  <ExternalLinkIcon className="size-3.5" />
                </a>
              </div>
              <p className="text-[12px] text-muted-foreground">
                {submittedAt
                  ? `Last saved by the client ${new Date(submittedAt).toLocaleString()}.`
                  : "The client hasn't saved anything yet."}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={pending}
                  className="btn btn-secondary h-8 flex-1 text-[12px]"
                  onClick={() => setConfirming("new")}
                >
                  New link
                </button>
                <button
                  type="button"
                  disabled={pending}
                  className="btn btn-ghost h-8 flex-1 text-[12px] text-bad"
                  onClick={() => setConfirming("off")}
                >
                  Turn off
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              disabled={pending}
              className="btn btn-primary w-full"
              onClick={() => run(() => createIntakeLink(clientId), "Link ready — copy it and send it to the client")}
            >
              {pending ? <Spinner /> : null} Create link
            </button>
          )}
        </div>
      </PopoverContent>

      <AlertDialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <AlertDialogContent data-modal>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirming === "off" ? "Turn the link off?" : "Make a new link?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirming === "off"
                ? "The client won't be able to open the form until you make a new link."
                : "The current link will stop working. Send the new one to the client."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={confirming === "off" ? "destructive" : "default"}
              onClick={() => {
                if (confirming === "off") run(() => disableIntakeLink(clientId), "Link turned off");
                else run(() => createIntakeLink(clientId), "New link made — send it to the client");
                setConfirming(null);
              }}
            >
              {confirming === "off" ? "Turn off" : "Make new link"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Popover>
  );
}
