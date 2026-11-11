import { timingSafeEqual } from "node:crypto";
import { runStoreWatch } from "@/lib/storeWatchRun";

// Store checks take a while (one app at a time, gently).
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const matches = (given: string, expected: string | undefined) =>
  !!expected &&
  given.length === expected.length &&
  timingSafeEqual(Buffer.from(given), Buffer.from(expected));

function allowed(req: Request): boolean {
  const key = req.headers.get("x-store-watch-key") ?? "";
  const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  return matches(key, process.env.STORE_WATCH_KEY) || matches(bearer, process.env.CRON_SECRET);
}

async function handle(req: Request) {
  if (!allowed(req)) return Response.json({ error: "Not allowed." }, { status: 401 });
  const results = await runStoreWatch();
  return Response.json({ checked: results.length, results });
}

/**
 * The hourly Store Watch run. Vercel Cron calls GET with
 * `Authorization: Bearer $CRON_SECRET`; any other scheduler can still use:
 *   curl -X POST -H "x-store-watch-key: $STORE_WATCH_KEY" https://<site>/api/store-watch
 */
export const GET = handle;
export const POST = handle;
