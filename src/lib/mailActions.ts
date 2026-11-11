"use server";

import { revalidatePath } from "next/cache";
import { getCurrentMemberId, requireUser } from "@/lib/auth";
import { errorMessage, exec, row, transaction } from "@/lib/db";
import {
  addTicketEvent,
  ingest,
  knownGmailIds,
  mailCursor,
  recordSync,
  resolveByLaterApproval,
  type IngestResult,
} from "@/lib/mailIngest";
import { TICKET_STATUSES, type MailInput, type TicketStatus } from "@/lib/mailRules";
import type { Session } from "@/lib/session";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function actorName(session: Session): Promise<string> {
  const member = await row<{ name: string }>("SELECT name FROM team_members WHERE user_id = ?", [
    session.userId,
  ]);
  return member?.name || session.email;
}

function refresh() {
  revalidatePath("/", "layout");
}

export async function getMailCursor(mailbox: string): Promise<number> {
  await requireUser();
  return mailCursor(mailbox);
}

export async function knownMailIds(mailbox: string, ids: string[]): Promise<string[]> {
  await requireUser();
  return knownGmailIds(mailbox, ids);
}

export async function ingestMails(mailbox: string, mails: MailInput[]): Promise<Result<IngestResult>> {
  await requireUser();
  try {
    return { ok: true, ...(await ingest(mailbox, mails)) };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function finishMailSync(
  mailbox: string,
  fetched: number,
  saved: number,
  newestAt: string | null,
): Promise<Result> {
  const session = await requireUser();
  try {
    await recordSync(mailbox, session.email, fetched, saved, newestAt);
    refresh();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function setTicketStatus(ticketId: string, status: TicketStatus): Promise<Result> {
  const session = await requireUser();
  try {
    const actor = await actorName(session);
    const changed = await exec(
      `UPDATE mail_tickets
          SET status = ?,
              resolved_at = IF(? = 'resolved', UTC_TIMESTAMP(3), NULL),
              resolved_by = IF(? = 'resolved', ?, NULL)
        WHERE id = ? AND status <> ?`,
      [status, status, status, actor, ticketId, status],
    );
    if (changed) await addTicketEvent(ticketId, "status", `Marked ${TICKET_STATUSES[status].label}`, actor);
    refresh();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function assignTicket(ticketId: string, memberId: string | null): Promise<Result> {
  const session = await requireUser();
  try {
    const actor = await actorName(session);
    const member = memberId
      ? await row<{ name: string }>("SELECT name FROM team_members WHERE id = ?", [memberId])
      : null;
    const changed = await exec(
      `UPDATE mail_tickets SET assigned_to = ?, assigned_at = UTC_TIMESTAMP(3), assigned_by = ?
        WHERE id = ? AND NOT (assigned_to <=> ?)`,
      [memberId, await getCurrentMemberId(), ticketId, memberId],
    );
    if (changed) {
      await addTicketEvent(ticketId, "assign", member ? `Assigned to ${member.name}` : "Unassigned", actor);
    }
    refresh();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function addTicketNote(ticketId: string, body: string): Promise<Result> {
  const session = await requireUser();
  const text = body.trim();
  if (!text) return { ok: false, error: "Write a note first." };
  if (text.length > 5000) return { ok: false, error: "Keep notes under 5000 characters." };
  try {
    await addTicketEvent(ticketId, "note", text, await actorName(session));
    refresh();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function linkTicketToProduct(
  ticketId: string,
  productId: string,
): Promise<Result<{ linked: number }>> {
  const session = await requireUser();
  try {
    const ticket = await row<{ label_key: string | null }>(
      "SELECT label_key FROM mail_tickets WHERE id = ?",
      [ticketId],
    );
    if (!ticket) return { ok: false, error: "That ticket no longer exists." };
    const product = await row<{ name: string }>(
      "SELECT COALESCE(NULLIF(app_name, ''), project_name) AS name FROM products WHERE id = ?",
      [productId],
    );
    if (!product) return { ok: false, error: "That app no longer exists." };
    const actor = await actorName(session);

    const linked = await transaction(async (conn) => {
      const mailSet = `SET product_id = ?, matched_by = 'manual', topic = LEFT(CONCAT(kind, ':', ?), 255)`;
      const ticketSet = `SET product_id = ?, topic = LEFT(CONCAT(kind, ':', ?), 255)`;
      let count = await exec(
        `UPDATE store_mails ${mailSet} WHERE ticket_id = ?`,
        [productId, productId, ticketId],
        conn,
      );
      await exec(`UPDATE mail_tickets ${ticketSet} WHERE id = ?`, [productId, productId, ticketId], conn);
      if (ticket.label_key) {
        count += await exec(
          `UPDATE store_mails ${mailSet} WHERE label_key = ? AND product_id IS NULL`,
          [productId, productId, ticket.label_key],
          conn,
        );
        await exec(
          `UPDATE mail_tickets ${ticketSet} WHERE label_key = ? AND product_id IS NULL`,
          [productId, productId, ticket.label_key],
          conn,
        );
      }
      await addTicketEvent(ticketId, "link", `Linked to ${product.name}`, actor, conn);
      return count;
    });
    await resolveByLaterApproval();
    refresh();
    return { ok: true, linked };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
