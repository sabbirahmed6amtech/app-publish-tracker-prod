"use client";

import { useState, useTransition } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/Modal";
import { Spinner } from "@/components/Spinner";
import { saveTeamMember } from "@/lib/actions";
import type { TeamMember } from "@/lib/types";

/** A team member's account: name, email and password. */
export function TeamMemberDialog({
  member,
  trigger,
  className = "btn btn-primary",
}: {
  member?: TeamMember;
  trigger: string;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [show, setShow] = useState(false);
  const editing = !!member;
  const hasAccount = !!member?.user_id;

  function submit(fd: FormData) {
    setError(null);
    start(async () => {
      const res = await saveTeamMember(fd);
      if (!res.ok) return setError(res.error);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        className={className}
        onClick={() => {
          setError(null);
          setShow(false);
          setOpen(true);
        }}
      >
        {trigger}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit member" : "Add member"}
        subtitle="They sign in with this email and password."
        width="max-w-md"
      >
        <form action={submit}>
          <div className="space-y-3 px-5 py-4">
            <input type="hidden" name="id" defaultValue={member?.id ?? ""} />

            <div>
              <label className="label" htmlFor="member-name">
                Name
              </label>
              <input
                id="member-name"
                name="name"
                required
                defaultValue={member?.name ?? ""}
                placeholder="Full name"
                className="field"
              />
            </div>

            <div>
              <label className="label" htmlFor="member-email">
                Email
              </label>
              <input
                id="member-email"
                name="email"
                type="email"
                required
                autoComplete="off"
                defaultValue={member?.login_email ?? member?.email ?? ""}
                placeholder="name@example.com"
                className="field"
              />
            </div>

            <div>
              <label className="label" htmlFor="member-password">
                {hasAccount ? "New password" : "Password"}
                {hasAccount && (
                  <span className="ml-1 font-normal text-muted-foreground">(leave blank to keep)</span>
                )}
              </label>
              <div className="relative">
                <input
                  id="member-password"
                  name="password"
                  type={show ? "text" : "password"}
                  required={!editing}
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  className="field pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  aria-label={show ? "Hide password" : "Show password"}
                  className="absolute right-1.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:text-foreground"
                >
                  {show ? <EyeOffIcon className="size-3.5" /> : <EyeIcon className="size-3.5" />}
                </button>
              </div>
              {editing && !hasAccount && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  No password yet — set one to let them sign in.
                </p>
              )}
            </div>

            <label className="flex cursor-pointer select-none items-center gap-2 text-[13px] text-foreground/85">
              <input
                type="checkbox"
                name="active"
                defaultChecked={member?.active ?? true}
                className="size-3.5 accent-foreground"
              />
              Active — show in the assignment dropdowns
            </label>

            {error && (
              <p className="rounded-md bg-bad-soft px-2.5 py-2 text-[12px] text-bad">{error}</p>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" disabled={pending} className="btn btn-primary">
              {pending ? (
                <>
                  <Spinner /> Saving…
                </>
              ) : editing ? (
                "Save member"
              ) : (
                "Add member"
              )}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
