import { type Conn, exec, insert, insertIgnore, row, rows } from "@/lib/db";
import { classify, decodeEntities, nameKey, type Classified, type MailInput } from "@/lib/mailRules";
import type { Platform } from "@/lib/types";

const WINDOW_MS = 48 * 3_600_000;
const OVERLAP_MS = 3_600_000;
const SYSTEM = "Store mail";

type ProductRef = {
  id: string;
  app_name: string;
  project_name: string;
  package_name: string | null;
  platform: Platform;
};

type Match = { productId: string; by: "package" | "name" | "manual" } | null;

export type IngestResult = { saved: number; matched: number; action: number; opened: number };

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function onPlatform(products: ProductRef[], platform: Platform | null): ProductRef[] {
  if (!platform) return products;
  const same = products.filter((p) => p.platform === platform);
  return same.length ? same : products;
}

function single(ids: string[]): string | null {
  const unique = [...new Set(ids)];
  return unique.length === 1 ? unique[0] : null;
}

function matchProduct(
  mail: MailInput,
  c: Classified,
  products: ProductRef[],
  learned: Map<string, string>,
): Match {
  const text = `${decodeEntities(mail.subject)}\n${mail.body}`;
  const withPackage = onPlatform(
    products.filter((p) => p.package_name?.trim()),
    c.platform,
  );
  const hits = withPackage.filter((p) =>
    new RegExp(`(?<![\\w.])${escapeRegex(p.package_name!.trim())}(?!\\.?\\w)`, "i").test(text),
  );
  if (hits.length) {
    const longest = Math.max(...hits.map((p) => p.package_name!.trim().length));
    const id = single(hits.filter((p) => p.package_name!.trim().length === longest).map((p) => p.id));
    if (id) return { productId: id, by: "package" };
  }

  const key = nameKey(c.label);
  if (!key) return null;
  const linked = learned.get(key);
  if (linked) return { productId: linked, by: "manual" };
  const named = onPlatform(products, c.platform).filter(
    (p) => nameKey(p.app_name) === key || nameKey(p.project_name) === key,
  );
  const id = single(named.map((p) => p.id));
  return id ? { productId: id, by: "name" } : null;
}

export async function mailCursor(mailbox: string): Promise<number> {
  const last = await row<{ newest: string | null }>(
    "SELECT MAX(newest_at) AS newest FROM mail_syncs WHERE mailbox = ?",
    [mailbox],
  );
  const floor = Date.now() - WINDOW_MS;
  const since = last?.newest ? Math.max(Date.parse(last.newest) - OVERLAP_MS, floor) : floor;
  return Math.floor(since / 1000);
}

export async function knownGmailIds(mailbox: string, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const found = await rows<{ gmail_id: string }>(
    `SELECT gmail_id FROM store_mails WHERE mailbox = ? AND gmail_id IN (${ids.map(() => "?").join(", ")})`,
    [mailbox, ...ids],
  );
  return found.map((f) => f.gmail_id);
}

export async function addTicketEvent(
  ticketId: string,
  kind: "opened" | "mail" | "reopened" | "status" | "assign" | "note" | "link",
  body: string | null,
  actor: string,
  on?: Conn,
) {
  await insert("mail_ticket_events", { ticket_id: ticketId, kind, body, actor, created_at: new Date() }, on);
}

async function autoAssignee(productId: string | null): Promise<string | null> {
  if (!productId) return null;
  const r = await row<{ assigned_to: string | null }>(
    `SELECT r.assigned_to FROM releases r JOIN products p ON p.client_id = r.client_id
      WHERE p.id = ? ORDER BY r.started_on DESC, r.created_at DESC LIMIT 1`,
    [productId],
  );
  return r?.assigned_to ?? null;
}

type TicketRow = { id: string; status: string; resolved_at: string | null };

async function attachToTicket(
  mailId: string,
  c: Classified,
  topic: string,
  productId: string | null,
  labelKey: string | null,
  subject: string,
  receivedAt: Date,
): Promise<boolean> {
  const ticket = await row<TicketRow>(
    "SELECT id, status, resolved_at FROM mail_tickets WHERE topic = ? ORDER BY created_at DESC LIMIT 1",
    [topic],
  );

  if (!ticket) {
    const id = await insert("mail_tickets", {
      topic,
      product_id: productId,
      source: c.source,
      kind: c.kind,
      app_label: c.label ? decodeEntities(c.label).slice(0, 255) : null,
      label_key: labelKey,
      subject,
      ...(await autoAssignee(productId).then((assigned_to) =>
        assigned_to ? { assigned_to, assigned_at: new Date(), assigned_by: null } : {},
      )),
      mail_count: 1,
      first_mail_at: receivedAt,
      last_mail_at: receivedAt,
      opened_at: new Date(),
      created_at: new Date(),
    });
    await addTicketEvent(id, "opened", subject, SYSTEM);
    await exec("UPDATE store_mails SET ticket_id = ? WHERE id = ?", [id, mailId]);
    return true;
  }

  const reopen =
    ticket.status === "resolved" && (!ticket.resolved_at || receivedAt > new Date(ticket.resolved_at));
  await exec(
    `UPDATE mail_tickets
        SET mail_count = mail_count + 1,
            last_mail_at = GREATEST(last_mail_at, ?),
            subject = CASE WHEN ? >= last_mail_at THEN ?::text ELSE subject END
            ${reopen ? ", status = 'open', opened_at = now(), resolved_at = NULL, resolved_by = NULL" : ""}
      WHERE id = ?`,
    [receivedAt, receivedAt, subject, ticket.id],
  );
  await addTicketEvent(ticket.id, reopen ? "reopened" : "mail", subject, SYSTEM);
  await exec("UPDATE store_mails SET ticket_id = ? WHERE id = ?", [ticket.id, mailId]);
  return reopen;
}

export async function resolveByLaterApproval() {
  const due = await rows<{ id: string; subject: string }>(
    `SELECT t.id, ok.subject
       FROM mail_tickets t
       JOIN (SELECT product_id, MAX(received_at) AS latest,
                    (array_agg(subject ORDER BY received_at DESC))[1] AS subject
               FROM store_mails
              WHERE kind IN ('approved', 'live') AND product_id IS NOT NULL
              GROUP BY product_id) ok ON ok.product_id = t.product_id
      WHERE t.status <> 'resolved'
        AND t.kind IN ('rejected', 'build_issue')
        AND t.last_mail_at < ok.latest`,
  );
  for (const t of due) {
    await exec(
      `UPDATE mail_tickets SET status = 'resolved', resolved_at = now(), resolved_by = ? WHERE id = ?`,
      [SYSTEM, t.id],
    );
    await addTicketEvent(t.id, "status", `Resolved by a later approval: ${t.subject}`, SYSTEM);
  }
}

export async function ingest(mailbox: string, mails: MailInput[]): Promise<IngestResult> {
  const [products, links] = await Promise.all([
    rows<ProductRef>(
      `SELECT p.id, p.app_name, p.project_name, p.package_name, pa.platform
         FROM products p JOIN publisher_accounts pa ON pa.id = p.account_id`,
    ),
    rows<{ label_key: string; product_id: string }>(
      `SELECT label_key, product_id FROM store_mails
        WHERE matched_by = 'manual' AND label_key IS NOT NULL
        ORDER BY received_at`,
    ),
  ]);
  const learned = new Map(links.map((l) => [l.label_key, l.product_id]));

  const sorted = [...mails].sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
  const result: IngestResult = { saved: 0, matched: 0, action: 0, opened: 0 };
  for (const mail of sorted) {
    const c = classify(mail);
    const match = matchProduct(mail, c, products, learned);
    if (!match && !c.action) continue;
    const labelKey = nameKey(c.label).slice(0, 191) || null;
    const topic = `${c.kind}:${match?.productId ?? labelKey ?? mail.gmailId}`.slice(0, 255);
    const subject = decodeEntities(mail.subject).slice(0, 512);
    const receivedAt = new Date(mail.receivedAt);
    const id = crypto.randomUUID();
    const inserted = await insertIgnore("store_mails", {
        id,
        gmail_id: mail.gmailId,
        thread_id: mail.threadId,
        mailbox,
        product_id: match?.productId ?? null,
        matched_by: match?.by ?? null,
        source: c.source,
        kind: c.kind,
        action_required: c.action,
        app_label: c.label ? decodeEntities(c.label).slice(0, 255) : null,
        label_key: labelKey,
        topic,
        sender: mail.from.slice(0, 255),
        subject,
        snippet: decodeEntities(mail.snippet).slice(0, 1000),
        received_at: receivedAt,
        created_at: new Date(),
    });
    if (!inserted) continue;
    result.saved += 1;
    if (match) result.matched += 1;
    if (c.action) {
      result.action += 1;
      const opened = await attachToTicket(id, c, topic, match?.productId ?? null, labelKey, subject, receivedAt);
      if (opened) result.opened += 1;
    }
  }
  if (result.saved) await resolveByLaterApproval();
  return result;
}

export async function recordSync(
  mailbox: string,
  syncedBy: string,
  fetched: number,
  saved: number,
  newestAt: string | null,
) {
  await exec(
    `INSERT INTO mail_syncs (id, mailbox, synced_by, newest_at, fetched, saved, synced_at)
     VALUES (gen_random_uuid()::text, ?, ?, ?, ?, ?, now())
     ON CONFLICT (mailbox, synced_by) DO UPDATE SET
       newest_at = GREATEST(mail_syncs.newest_at, EXCLUDED.newest_at),
       fetched = mail_syncs.fetched + EXCLUDED.fetched,
       saved = mail_syncs.saved + EXCLUDED.saved,
       synced_at = EXCLUDED.synced_at`,
    [mailbox, syncedBy, newestAt ? new Date(newestAt) : null, fetched, saved],
  );
}
