"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, PencilIcon } from "lucide-react";
import { toast } from "sonner";
import { Spinner } from "@/components/Spinner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { updateAppField, type InlineField } from "@/lib/actions";
import type { TeamMember } from "@/lib/types";

/** Saves one field and shows the result while the page refreshes behind it. */
function useFieldSave(appId: string, field: InlineField) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function save(value: string | null, onFail: () => void) {
    start(async () => {
      const res = await updateAppField(appId, field, value);
      if (!res.ok) {
        onFail();
        toast.error(`Couldn't save: ${res.error}`);
        return;
      }
      router.refresh();
    });
  }
  return { pending, save };
}

/**
 * A table cell's text that turns into an input on click. Enter or leaving the
 * field saves; Escape cancels.
 */
export function InlineText({
  appId,
  field,
  value,
  placeholder = "—",
  mono = false,
  className = "",
}: {
  appId: string;
  field: InlineField;
  value: string | null;
  placeholder?: string;
  mono?: boolean;
  className?: string;
}) {
  const { pending, save } = useFieldSave(appId, field);
  const [editing, setEditing] = useState(false);
  const [shown, setShown] = useState(value ?? "");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => setShown(value ?? ""), [value]);
  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  function commit() {
    setEditing(false);
    const next = input.current?.value.trim() ?? "";
    if (next === (value ?? "")) return;
    setShown(next);
    save(next || null, () => setShown(value ?? ""));
  }

  if (editing) {
    return (
      <input
        ref={input}
        defaultValue={shown}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        aria-label={`Edit ${field.replace("_", " ")}`}
        className={`field h-7 px-2 py-0 ${mono ? "font-mono text-[12px]" : ""} ${className}`}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title="Click to edit"
      className={`group/inline -mx-1.5 inline-flex max-w-full items-center gap-1.5 rounded-md px-1.5 py-0.5
                  text-left hover:bg-muted ${mono ? "font-mono text-[12px]" : ""} ${className}`}
    >
      <span className={`truncate ${shown ? "" : "font-sans text-muted-foreground/60"}`}>
        {shown || placeholder}
      </span>
      {pending ? (
        <Spinner />
      ) : (
        <PencilIcon className="size-3 shrink-0 text-muted-foreground opacity-0 group-hover/inline:opacity-100" />
      )}
    </button>
  );
}

/** Pick who an app is assigned to without opening the edit dialog. */
export function InlineAssignee({
  appId,
  value,
  team,
  name: currentName,
  fallbackName,
}: {
  appId: string;
  value: string | null;
  team: TeamMember[];
  /** Resolved name of `value`, for people no longer in the active team. */
  name?: string | null;
  /** Shown when the app itself is unassigned, e.g. the release's owner. */
  fallbackName?: string | null;
}) {
  const { pending, save } = useFieldSave(appId, "assigned_to");
  const [shown, setShown] = useState(value);
  useEffect(() => setShown(value), [value]);

  const name = shown
    ? (team.find((m) => m.id === shown)?.name ?? (shown === value ? currentName : null))
    : null;

  function pick(next: string | null) {
    if (next === shown) return;
    const previous = shown;
    setShown(next);
    save(next, () => setShown(previous));
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={pending}
        className="-mx-1.5 inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-1.5 py-0.5 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {name ?? (
          <span className="text-muted-foreground/60">{fallbackName ?? "Unassigned"}</span>
        )}
        {pending && <Spinner />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {team.map((m) => (
          <DropdownMenuItem key={m.id} onSelect={() => pick(m.id)} className="text-[14px]">
            {m.name}
            {m.id === shown && <CheckIcon className="ml-auto size-3.5" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => pick(null)} className="text-[14px] text-muted-foreground">
          Unassigned
          {!shown && <CheckIcon className="ml-auto size-3.5" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
