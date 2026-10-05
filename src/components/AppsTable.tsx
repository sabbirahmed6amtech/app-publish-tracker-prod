"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PLATFORMS, STATUSES, STATUS_ORDER, daysSince, isStale } from "@/lib/constants";
import { rowsToCsv } from "@/lib/csv";
import { reportFromRows } from "@/lib/report";
import { CopyReportButton } from "@/components/CopyReportButton";
import { StatusSelect } from "@/components/RowActions";
import { InlineAssignee, InlineText } from "@/components/InlineEdit";
import { ProjectLogo } from "@/components/ProjectLogo";
import { StoreIcon } from "@/components/StoreIcon";
import type { AppRow, AppStatus, LineBadge, Platform, TeamMember } from "@/lib/types";

type Sort = { key: "client" | "project" | "app" | "status" | "person"; dir: 1 | -1 };

export function AppsTable({
  rows,
  team,
  badges,
  lineNames,
  initialStatus = "",
  initialPlatform = "",
  initialAttention = false,
  initialMinAge = 0,
}: {
  rows: AppRow[];
  team: TeamMember[];
  /** project name -> product line logo */
  badges: Record<string, LineBadge>;
  /** Product line names, so the report can shorten "6amMart-User-App" to "User". */
  lineNames: string[];
  initialStatus?: AppStatus | "";
  initialPlatform?: Platform | "";
  initialAttention?: boolean;
  initialMinAge?: number;
}) {
  const [q, setQ] = useState("");
  const [platform, setPlatform] = useState<Platform | "">(initialPlatform);
  const [status, setStatus] = useState<AppStatus | "">(initialStatus);
  const [project, setProject] = useState("");
  const [person, setPerson] = useState("");
  const [attentionOnly, setAttentionOnly] = useState(initialAttention);
  const [minAge, setMinAge] = useState(initialMinAge);
  const [grouped, setGrouped] = useState(true);
  const [sort, setSort] = useState<Sort>({ key: "client", dir: 1 });

  const projects = useMemo(
    () => [...new Set(rows.map((r) => r.project_name))].sort(),
    [rows],
  );

  const people = useMemo(
    () =>
      [...new Set(rows.flatMap((r) => [r.assignee_name, r.release_assignee_name]).filter(Boolean))].sort() as string[],
    [rows],
  );

  const filtered = useMemo(() => {
    const needle = q.toLowerCase().trim();

    const out = rows.filter((r) => {
      if (platform && r.platform !== platform) return false;
      if (status && r.status !== status) return false;
      if (project && r.project_name !== project) return false;
      if (person && r.assignee_name !== person && r.release_assignee_name !== person)
        return false;
      if (minAge > 0) {
        // Age is only meaningful for work still open; a live app's age is
        // just how long ago it shipped.
        if (r.status === "production") return false;
        if (daysSince(r.status_changed_at) < minAge) return false;
      }
      if (attentionOnly) {
        const flagged =
          r.status === "rejected" ||
          r.status === "on_hold" ||
          isStale(r.status, r.status_changed_at);
        if (!flagged) return false;
      }
      if (!needle) return true;
      return [
        r.ticket,
        r.client_name,
        r.release_label,
        r.account_name,
        r.project_name,
        r.app_name,
        r.assignee_name,
        r.release_assignee_name,
        r.build_version,
        r.note,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });

    const value = (r: AppRow) => {
      switch (sort.key) {
        case "client":
          return `${r.client_name} ${r.release_label} ${String(r.sort_order).padStart(3, "0")}`;
        case "project":
          return r.project_name;
        case "app":
          return r.app_name;
        case "person":
          return r.assignee_name ?? r.release_assignee_name ?? "zzz";
        case "status":
          return String(STATUS_ORDER.indexOf(r.status)).padStart(2, "0");
      }
    };

    return out.sort((a, b) => value(a).localeCompare(value(b)) * sort.dir);
  }, [rows, q, platform, status, project, person, attentionOnly, minAge, sort]);

  // Grouped view mirrors the app's structure: one card per release.
  const groups = useMemo(() => {
    if (!grouped) return null;
    const map = new Map<string, AppRow[]>();
    for (const r of filtered) {
      if (!map.has(r.release_id)) map.set(r.release_id, []);
      map.get(r.release_id)!.push(r);
    }
    return [...map.values()];
  }, [filtered, grouped]);

  const active = q || platform || status || project || person || attentionOnly || minAge > 0;

  // One report covering every release still visible under the filters.
  const report = useMemo(() => reportFromRows(filtered, lineNames), [filtered, lineNames]);
  const releaseCount = useMemo(
    () => new Set(filtered.map((r) => r.release_id)).size,
    [filtered],
  );

  function download() {
    const blob = new Blob([rowsToCsv(filtered)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `publish-tracker-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      <div className="card flex flex-wrap items-center gap-2 px-3 py-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter by keyword, ticket, version, app…"
          className="field min-w-[200px] flex-1 border-0 shadow-none"
        />

        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value as Platform | "")}
          className="field w-auto"
        >
          <option value="">All platforms</option>
          {Object.entries(PLATFORMS).map(([v, m]) => (
            <option key={v} value={v}>
              {m.label}
            </option>
          ))}
        </select>

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as AppStatus | "")}
          className="field w-auto"
        >
          <option value="">All statuses</option>
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {STATUSES[s].label}
            </option>
          ))}
        </select>

        <select
          value={project}
          onChange={(e) => setProject(e.target.value)}
          className="field w-auto max-w-[170px]"
        >
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        {people.length > 0 && (
          <select
            value={person}
            onChange={(e) => setPerson(e.target.value)}
            className="field w-auto max-w-[150px]"
          >
            <option value="">Anyone</option>
            {people.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        )}

        <select
          value={minAge}
          onChange={(e) => setMinAge(Number(e.target.value))}
          className="field w-auto"
          aria-label="Minimum age"
        >
          <option value={0}>Any age</option>
          <option value={4}>Open 4+ days</option>
          <option value={8}>Open 8+ days</option>
          <option value={15}>Open 15+ days</option>
        </select>

        <label className="flex cursor-pointer select-none items-center gap-1.5 px-1 text-[12px] font-medium text-foreground/70">
          <input
            type="checkbox"
            checked={attentionOnly}
            onChange={(e) => setAttentionOnly(e.target.checked)}
            className="size-3.5 accent-foreground"
          />
          Needs attention
        </label>

        <span className="h-5 w-px bg-muted" />

        <label className="flex cursor-pointer select-none items-center gap-1.5 px-1 text-[12px] font-medium text-foreground/70">
          <input
            type="checkbox"
            checked={grouped}
            onChange={(e) => setGrouped(e.target.checked)}
            className="size-3.5 accent-foreground"
          />
          Group by release
        </label>

        {active && (
          <button
            className="btn btn-ghost px-2 py-1"
            onClick={() => {
              setQ("");
              setPlatform("");
              setStatus("");
              setProject("");
              setPerson("");
              setAttentionOnly(false);
              setMinAge(0);
            }}
          >
            Clear
          </button>
        )}

        <CopyReportButton report={report} count={releaseCount} />

        <button className="btn btn-secondary" onClick={download}>
          Export CSV
        </button>
      </div>

      <p className="px-1 text-[12px] text-muted-foreground">
        {filtered.length} of {rows.length} apps
      </p>

      {filtered.length === 0 ? (
        <div className="card px-4 py-10 text-center text-[13px] text-muted-foreground">
          {rows.length === 0
            ? "No apps yet. Create a client, then a release, then add its apps."
            : "Nothing matches those filters."}
        </div>
      ) : groups ? (
        <div className="space-y-3">
          {groups.map((g) => (
            <GroupCard
              key={g[0].release_id}
              rows={g}
              team={team}
              badges={badges}
              sort={sort}
              setSort={setSort}
            />
          ))}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <Table
            rows={filtered}
            team={team}
            badges={badges}
            showRelease
            sort={sort}
            setSort={setSort}
          />
        </div>
      )}
    </div>
  );
}

function GroupCard({
  rows,
  team,
  badges,
  sort,
  setSort,
}: {
  rows: AppRow[];
  team: TeamMember[];
  badges: Record<string, LineBadge>;
  sort: Sort;
  setSort: (s: Sort) => void;
}) {
  const head = rows[0];
  const live = rows.filter((r) => r.status === "production").length;

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-4 py-2.5">
        <div className="min-w-0">
          <Link
            href={`/releases/${head.release_id}`}
            className="text-[14px] font-semibold text-foreground hover:underline"
          >
            {head.client_name} · {head.release_label}
          </Link>
          <span className="ml-2 font-mono text-[11px] text-muted-foreground/80">#{head.ticket}</span>
          <div className="mt-0.5 truncate text-[12px] text-muted-foreground">
            {head.release_title ? `${head.release_title} · ` : ""}
            {head.release_assignee_name || "Unassigned"} · {rows.length} apps · {live} live
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <Table rows={rows} team={team} badges={badges} sort={sort} setSort={setSort} />
      </div>
    </section>
  );
}

function Table({
  rows,
  team,
  badges,
  showRelease = false,
  sort,
  setSort,
}: {
  rows: AppRow[];
  team: TeamMember[];
  badges: Record<string, LineBadge>;
  showRelease?: boolean;
  sort: Sort;
  setSort: (s: Sort) => void;
}) {
  function Th({ label, sortKey }: { label: string; sortKey?: Sort["key"] }) {
    if (!sortKey) return <th className="th">{label}</th>;
    const on = sort.key === sortKey;
    return (
      <th className="th">
        <button
          className="inline-flex items-center gap-1 hover:text-foreground"
          onClick={() => setSort({ key: sortKey, dir: on && sort.dir === 1 ? -1 : 1 })}
        >
          {label}
          <span className={on ? "text-foreground" : "text-transparent"}>
            {on && sort.dir === -1 ? "↓" : "↑"}
          </span>
        </button>
      </th>
    );
  }

  return (
    <table className="w-full min-w-[900px] border-collapse">
      <thead>
        <tr className="border-b border-border">
          {showRelease && <Th label="Client / release" sortKey="client" />}
          <Th label="Platform" />
          <Th label="Project" sortKey="project" />
          <Th label="App name" sortKey="app" />
          <Th label="Assigned to" sortKey="person" />
          <Th label="Status" sortKey="status" />
          <Th label="Build number" />
          <th className="th text-right">Link</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr
            key={r.id}
            className="border-b border-border/60 last:border-0 hover:bg-muted/40"
          >
            {showRelease && (
              <td className="td">
                <Link
                  href={`/releases/${r.release_id}`}
                  className="font-medium text-foreground hover:underline"
                >
                  {r.client_name}
                </Link>
                <span className="ml-1.5 text-[11px] text-muted-foreground/80">
                  {r.release_label}
                </span>
              </td>
            )}
            <td className="td whitespace-nowrap text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <StoreIcon platform={r.platform} size={13} />
                {PLATFORMS[r.platform].label}
              </span>
            </td>
            <td className="td whitespace-nowrap font-medium">
              <span className="flex items-center gap-2">
                <ProjectLogo badge={badges[r.project_name]} project={r.project_name} size="xs" />
                {r.project_name}
              </span>
            </td>
            <td className="td">{r.app_name || <span className="text-muted-foreground/50">—</span>}</td>
            <td className="td whitespace-nowrap">
              <InlineAssignee
                appId={r.id}
                value={r.assigned_to}
                team={team}
                name={r.assignee_name}
                fallbackName={r.release_assignee_name}
              />
            </td>
            <td className="td">
              <div className="flex items-center gap-2">
                <StatusSelect appId={r.id} status={r.status} />
                {isStale(r.status, r.status_changed_at) && (
                  <span
                    className="text-[11px] font-medium text-muted-foreground/80"
                    title={`No status change in ${daysSince(r.status_changed_at)} days`}
                  >
                    {daysSince(r.status_changed_at)}d
                  </span>
                )}
              </div>
            </td>
            <td className="td whitespace-nowrap">
              <InlineText
                appId={r.id}
                field="build_version"
                value={r.build_version}
                placeholder="Add build number"
                mono
                className="w-36"
              />
            </td>
            <td className="td text-right">
              {r.store_url ? (
                <a
                  href={r.store_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[12px] font-medium text-info hover:underline"
                >
                  Store ↗
                </a>
              ) : (
                <span className="text-muted-foreground/50">—</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
