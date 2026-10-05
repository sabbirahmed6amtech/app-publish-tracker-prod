import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRightIcon } from "lucide-react";
import { DeleteButton } from "@/components/RowActions";
import { ReleaseView } from "@/components/ReleaseView";
import { ActivityTimeline, type TimelineApp } from "@/components/ActivityTimeline";
import {
  getActivityPage,
  getProductLines,
  getRelease,
  getTeam,
  lineBadges,
} from "@/lib/queries";
import { deleteRelease } from "@/lib/actions";
import { releaseLabel } from "@/lib/constants";

export const dynamic = "force-dynamic";

const ACTIVITY_PAGE_SIZE = 10;

export default async function ReleasePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ activity?: string }>;
}) {
  const { id } = await params;
  const requested = Math.max(1, Number((await searchParams).activity) || 1);
  const [detail, roster, lines] = await Promise.all([
    getRelease(id),
    getTeam(),
    getProductLines(),
  ]);
  if (!detail) notFound();

  const { release, client, accounts, keystores, products, siblings, everLive } = detail;
  const apps = release.apps;
  const accountPlatform = new Map(accounts.map((a) => [a.id, a.platform]));
  const timelineApps = new Map<string, TimelineApp>(
    apps.map((a) => [
      a.id,
      {
        name: a.app_name || a.project_name,
        project: a.project_name,
        platform: accountPlatform.get(a.account_id) ?? "play_store",
      },
    ]),
  );
  let activity = await getActivityPage(
    apps.map((a) => a.id),
    requested,
    ACTIVITY_PAGE_SIZE,
  ).catch(() => ({ events: [], total: 0 }));
  // A page past the end (say, after a link was shared) falls back to the last one.
  const lastPage = Math.max(1, Math.ceil(activity.total / ACTIVITY_PAGE_SIZE));
  const activityPage = Math.min(requested, lastPage);
  if (activityPage !== requested) {
    activity = await getActivityPage(apps.map((a) => a.id), activityPage, ACTIVITY_PAGE_SIZE);
  }
  const isCurrent = siblings[0]?.id === release.id;

  return (
    <>
      <nav className="mb-4 flex items-center gap-1 text-[13px] text-muted-foreground">
        <Link href={`/clients/${client.id}`} className="font-medium hover:text-foreground">
          {client.name}
        </Link>
        <ChevronRightIcon className="size-3.5" />
        <Link href={`/clients/${client.id}?tab=releases`} className="hover:text-foreground">
          Releases
        </Link>
        <ChevronRightIcon className="size-3.5" />
        <span className="text-foreground">{releaseLabel(release)}</span>
        {isCurrent && (
          <span className="ml-1.5 rounded-md border bg-card px-1.5 text-[11px]">Current</span>
        )}
      </nav>

      <ReleaseView
        release={release}
        client={client}
        accounts={accounts}
        keystores={keystores}
        products={products}
        siblings={siblings}
        everLive={everLive}
        roster={roster}
        lines={lines}
      />

      <ActivityTimeline
        events={activity.events}
        apps={timelineApps}
        badges={lineBadges(lines)}
        page={activityPage}
        pageSize={ACTIVITY_PAGE_SIZE}
        total={activity.total}
        hrefFor={(n) => `/releases/${release.id}${n > 1 ? `?activity=${n}` : ""}#activity`}
      />

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3">
        <p className="text-[12px] text-muted-foreground">
          Deleting {releaseLabel(release)} removes its {apps.length} submissions and their
          history. The client and its apps stay.
        </p>
        <DeleteButton
          label="Delete release"
          confirmText={`Delete ${releaseLabel(release)} and its ${apps.length} submissions?`}
          action={async () => {
            "use server";
            return deleteRelease(release.id);
          }}
          className="btn btn-secondary text-destructive hover:bg-destructive/10"
        />
      </div>
    </>
  );
}
