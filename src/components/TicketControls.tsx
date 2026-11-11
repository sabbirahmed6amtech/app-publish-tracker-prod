"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, ChevronDownIcon, RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MemberAvatar, StatusIcon } from "@/components/MailList";
import { TICKET_STATUSES, type TicketStatus } from "@/lib/mailRules";
import { addTicketNote, assignTicket, setTicketStatus } from "@/lib/mailActions";

const ORDER: TicketStatus[] = ["open", "in_progress", "resolved"];

type Member = { id: string; name: string };

function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return void toast.error(res.error);
      router.refresh();
    });
  return [pending, run] as const;
}

const TRIGGER =
  "-mx-2 inline-flex h-8 max-w-full items-center gap-2 rounded-md px-2 text-[13px] transition-colors hover:bg-muted disabled:opacity-60";

export function StatusMenu({ ticketId, status }: { ticketId: string; status: TicketStatus }) {
  const [pending, run] = useAction();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={TRIGGER} disabled={pending}>
        <StatusIcon status={status} />
        {TICKET_STATUSES[status].label}
        <ChevronDownIcon className="size-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        {ORDER.map((s) => (
          <DropdownMenuItem
            key={s}
            className="gap-2 text-[13px]"
            onSelect={() => s !== status && run(() => setTicketStatus(ticketId, s))}
          >
            <StatusIcon status={s} />
            {TICKET_STATUSES[s].label}
            {s === status && <CheckIcon className="ml-auto size-3.5" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AssigneeMenu({
  ticketId,
  assignedTo,
  members,
  meId,
}: {
  ticketId: string;
  assignedTo: string | null;
  members: Member[];
  meId: string | null;
}) {
  const [pending, run] = useAction();
  const current = members.find((m) => m.id === assignedTo) ?? null;
  const assign = (id: string | null) => id !== assignedTo && run(() => assignTicket(ticketId, id));
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={TRIGGER} disabled={pending}>
        <MemberAvatar name={current?.name ?? null} />
        <span className={`truncate ${current ? "" : "text-muted-foreground"}`}>{current?.name ?? "Unassigned"}</span>
        <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {meId && meId !== assignedTo && (
          <>
            <DropdownMenuItem className="text-[13px] font-medium" onSelect={() => assign(meId)}>
              Assign to me
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem className="gap-2 text-[13px]" onSelect={() => assign(null)}>
          <MemberAvatar name={null} />
          <span className="text-muted-foreground">Unassigned</span>
          {!assignedTo && <CheckIcon className="ml-auto size-3.5" />}
        </DropdownMenuItem>
        {members.map((m) => (
          <DropdownMenuItem key={m.id} className="gap-2 text-[13px]" onSelect={() => assign(m.id)}>
            <MemberAvatar name={m.name} />
            <span className="truncate">{m.name}</span>
            {m.id === assignedTo && <CheckIcon className="ml-auto size-3.5" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ResolveButton({ ticketId, status }: { ticketId: string; status: TicketStatus }) {
  const [pending, run] = useAction();
  if (status === "resolved") {
    return (
      <button
        type="button"
        className="btn btn-secondary h-8"
        disabled={pending}
        onClick={() => run(() => setTicketStatus(ticketId, "open"))}
      >
        <RotateCcwIcon className="size-3.5" /> Reopen
      </button>
    );
  }
  return (
    <button
      type="button"
      className="btn btn-primary h-8"
      disabled={pending}
      onClick={() => run(() => setTicketStatus(ticketId, "resolved"))}
    >
      <CheckIcon className="size-3.5" /> Resolve
    </button>
  );
}

export function NoteComposer({ ticketId, author }: { ticketId: string; author: string | null }) {
  const [text, setText] = useState("");
  const [pending, run] = useAction();
  const submit = () => {
    if (!text.trim() || pending) return;
    run(async () => {
      const res = await addTicketNote(ticketId, text);
      if (res.ok) setText("");
      return res;
    });
  };
  return (
    <div className="flex gap-3">
      <MemberAvatar name={author} size={32} />
      <form
        className="min-w-0 flex-1 overflow-hidden rounded-lg border bg-card focus-within:border-ring"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <textarea
          className="block min-h-[76px] w-full resize-y bg-transparent px-3 py-2.5 text-[13px] outline-none placeholder:text-muted-foreground"
          placeholder="Leave an internal note: what was fixed, which build was resubmitted…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          disabled={pending}
        />
        <div className="flex items-center justify-between gap-2 border-t bg-muted/30 px-3 py-1.5">
          <span className="text-[11px] text-muted-foreground">Only your team sees notes · ⌘↵ to save</span>
          <button type="submit" className="btn btn-primary h-7 px-2.5 text-[12px]" disabled={pending || !text.trim()}>
            {pending ? "Saving…" : "Add note"}
          </button>
        </div>
      </form>
    </div>
  );
}
