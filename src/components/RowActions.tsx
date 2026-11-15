"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDownIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { STATUSES, STATUS_ORDER } from "@/lib/constants";
import { Spinner } from "@/components/Spinner";
import { StatusGlyph } from "@/components/StatusGlyph";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { setAppStatus } from "@/lib/actions";
import type { AppStatus } from "@/lib/types";

/** Every status as menu items, each with its glyph so colour isn't the only cue. */
export function StatusMenuItems({
  current,
  onPick,
}: {
  current: AppStatus;
  onPick: (status: AppStatus) => void;
}) {
  return (
    <>
      {STATUS_ORDER.map((s) => (
        <DropdownMenuItem
          key={s}
          disabled={s === current}
          onSelect={() => onPick(s)}
          className="gap-2 text-[14px]"
        >
          <StatusGlyph status={s} size={12} />
          {STATUSES[s].label}
        </DropdownMenuItem>
      ))}
    </>
  );
}

/** Inline status change — the one edit made often enough to deserve no modal. */
export function StatusSelect({ appId, status }: { appId: string; status: AppStatus }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  // Shown immediately; the server catches up behind it.
  const [optimistic, setOptimistic] = useState<AppStatus | null>(null);
  const shown = (pending && optimistic) || status;

  function pick(next: AppStatus) {
    setOptimistic(next);
    start(async () => {
      const res = await setAppStatus(appId, next);
      if (!res.ok) toast.error(`Couldn't change status: ${res.error}`);
      else toast.success(`Moved to ${STATUSES[next].label}`);
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={pending}
        aria-label="Change status"
        className={`inline-flex items-center gap-1.5 rounded-full py-0.5 pl-2 pr-1.5 text-[12px]
                    font-medium whitespace-nowrap ring-1 ring-inset transition-opacity outline-none
                    focus-visible:ring-2 ${STATUSES[shown].chip} ${pending ? "opacity-60" : ""}`}
      >
        {pending ? <Spinner /> : <StatusGlyph status={shown} size={11} />}
        {STATUSES[shown].label}
        <ChevronDownIcon className="size-3 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        <StatusMenuItems current={shown} onPick={pick} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function DeleteButton({
  label,
  confirmText,
  action,
  className = "btn btn-ghost px-2 py-1",
}: {
  label: string;
  confirmText: string;
  action: () => Promise<{ ok: boolean; error?: string }>;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const iconOnly = label === "✕";

  return (
    <>
      <button
        type="button"
        disabled={pending}
        className={className}
        aria-label={iconOnly ? "Delete" : undefined}
        onClick={() => setOpen(true)}
      >
        {pending ? <Spinner /> : iconOnly ? <Trash2Icon className="size-3.5" /> : label}
      </button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent data-modal>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>{confirmText}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                start(async () => {
                  const res = await action();
                  if (!res.ok && res.error) toast.error(res.error);
                  router.refresh();
                })
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
