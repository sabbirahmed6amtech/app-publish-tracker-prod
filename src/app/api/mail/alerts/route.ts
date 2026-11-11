import { getCurrentMemberId, getSession } from "@/lib/auth";
import { rows } from "@/lib/db";

export const dynamic = "force-dynamic";

type Alert = {
  id: string;
  number: number;
  kind: string;
  subject: string;
  app_name: string | null;
  client_name: string | null;
  app_label: string | null;
  reopened: boolean;
  assigned_to_me: boolean;
};

export async function GET(req: Request) {
  if (!(await getSession())) return Response.json({ error: "Sign in first." }, { status: 401 });

  const now = new Date().toISOString();
  const since = new URL(req.url).searchParams.get("since");
  if (!since || Number.isNaN(Date.parse(since))) return Response.json({ now, tickets: [] });

  const from = new Date(since);
  const to = new Date(now);
  const me = await getCurrentMemberId();
  const tickets = await rows<Alert>(
    `SELECT t.id, t.number, t.kind, t.subject, t.app_label,
            COALESCE(NULLIF(p.app_name, ''), p.project_name) AS app_name, c.name AS client_name,
            t.opened_at > t.created_at + INTERVAL 1 SECOND AS reopened,
            (t.assigned_to <=> ? AND t.assigned_at > ? AND t.assigned_at <= ?) AS assigned_to_me
       FROM mail_tickets t
       LEFT JOIN products p ON p.id = t.product_id
       LEFT JOIN clients c ON c.id = p.client_id
      WHERE t.status <> 'resolved'
        AND ((t.opened_at > ? AND t.opened_at <= ?)
          OR (? IS NOT NULL AND t.assigned_to = ? AND t.assigned_at > ? AND t.assigned_at <= ?))
      ORDER BY GREATEST(t.opened_at, COALESCE(t.assigned_at, t.opened_at)) DESC LIMIT 10`,
    [me, from, to, from, to, me, me, from, to],
  );
  return Response.json({ now, tickets });
}
