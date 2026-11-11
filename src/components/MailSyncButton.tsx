"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MailIcon } from "lucide-react";
import { toast } from "sonner";
import {
  GmailAuthError,
  fetchStoreMails,
  forgetGmailToken,
  gmailAddress,
  listStoreMailIds,
  requestGmailToken,
  setQuotaWaitListener,
  storedGmailToken,
} from "@/lib/gmailClient";
import { finishMailSync, getMailCursor, ingestMails, knownMailIds } from "@/lib/mailActions";

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
const BATCH = 25;

async function sync(token: string, onStep: (text: string) => void) {
  const mailbox = await gmailAddress(token);
  onStep(`Searching ${mailbox}…`);
  const since = await getMailCursor(mailbox);
  const listed = await listStoreMailIds(token, since);
  const known = new Set(await knownMailIds(mailbox, listed));
  const ids = listed.filter((id) => !known.has(id));
  const mails = await fetchStoreMails(token, ids, (done) =>
    onStep(`Reading ${done} of ${ids.length} emails…`),
  );

  let saved = 0;
  let matched = 0;
  let action = 0;
  let opened = 0;
  for (let i = 0; i < mails.length; i += BATCH) {
    onStep(`Matching emails to apps… ${Math.min(i + BATCH, mails.length)} of ${mails.length}`);
    const res = await ingestMails(mailbox, mails.slice(i, i + BATCH));
    if (!res.ok) throw new Error(res.error);
    saved += res.saved;
    matched += res.matched;
    action += res.action;
    opened += res.opened;
  }

  const newest = mails.reduce<string | null>(
    (max, m) => (!max || m.receivedAt > max ? m.receivedAt : max),
    null,
  );
  const done = await finishMailSync(mailbox, mails.length, saved, newest);
  if (!done.ok) throw new Error(done.error);
  return { mailbox, read: mails.length, skipped: known.size, saved, matched, action, opened };
}

export function MailSyncButton({ className = "btn btn-primary" }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run() {
    if (!CLIENT_ID) return void toast.error("NEXT_PUBLIC_GOOGLE_CLIENT_ID is not set.");
    setBusy(true);
    const id = toast.loading("Signing in to Gmail…");
    const step = (text: string) => toast.loading(text, { id });
    setQuotaWaitListener((seconds) =>
      step(`Gmail's per-minute limit reached. Waiting ${seconds}s, then continuing…`),
    );
    try {
      let token = storedGmailToken() ?? (await requestGmailToken(CLIENT_ID));
      let result;
      try {
        result = await sync(token, step);
      } catch (e) {
        if (!(e instanceof GmailAuthError)) throw e;
        forgetGmailToken();
        token = await requestGmailToken(CLIENT_ID);
        result = await sync(token, step);
      }
      toast.success(
        result.saved
          ? `${result.saved} new store ${result.saved === 1 ? "email" : "emails"} · ${result.matched} matched to apps · ${result.opened} new or reopened ${result.opened === 1 ? "ticket" : "tickets"}`
          : `No new store emails in ${result.mailbox}.`,
        {
          id,
          description: `Read ${result.read} new emails from the stores${result.skipped ? `, ${result.skipped} already synced` : ""}.`,
        },
      );
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e), { id });
    } finally {
      setQuotaWaitListener(null);
      setBusy(false);
    }
  }

  return (
    <button type="button" onClick={run} disabled={busy} className={className}>
      <MailIcon className={`size-4 ${busy ? "animate-pulse" : ""}`} />
      {busy ? "Syncing…" : "Sync inbox"}
    </button>
  );
}
