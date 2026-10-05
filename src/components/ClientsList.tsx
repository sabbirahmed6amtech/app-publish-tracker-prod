"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SearchIcon } from "lucide-react";
import { RELEASE_STATES, formatDate } from "@/lib/constants";
import { StoreIcon } from "@/components/StoreIcon";
import { ProjectLogo } from "@/components/ProjectLogo";
import type { LineBadge, Platform, ReleaseState } from "@/lib/types";

export type ClientCard = {
  id: string;
  ticket: string;
  name: string;
  badge: LineBadge | null;
  accounts: { platform: Platform; label: string; accountName: string }[];
  releaseCount: number;
  totalApps: number;
  latest: {
    id: string;
    label: string;
    state: ReleaseState;
    assignee: string | null;
    date: string;
  } | null;
};

export function ClientsList({ clients }: { clients: ClientCard[] }) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return clients;
    return clients.filter((c) =>
      [
        c.ticket,
        c.name,
        ...c.accounts.map((a) => `${a.label} ${a.accountName}`),
        c.latest?.label ?? "",
        c.latest?.assignee ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [clients, q]);

  return (
    <>
      <div className="card mb-3 flex items-center gap-2 px-3 py-2">
        <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search clients by name, ticket, store account, version or person"
          className="field flex-1 border-0 shadow-none"
          autoComplete="off"
        />
        {q && (
          <button className="btn btn-ghost px-2 py-1" onClick={() => setQ("")}>
            Clear
          </button>
        )}
        <span className="shrink-0 px-1 text-[12px] tabular-nums text-muted-foreground/80">
          {filtered.length}/{clients.length}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="card px-6 py-14 text-center">
          <p className="text-[14px] font-medium text-foreground">No client matches that.</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Try a ticket number, a store account, or a person&rsquo;s name.
          </p>
        </div>
      ) : (
        <div className="grid gap-2.5 xl:grid-cols-2">
          {filtered.map((c) => {
            const state = c.latest ? RELEASE_STATES[c.latest.state] : null;
            return (
              <Link
                key={c.id}
                href={`/clients/${c.id}`}
                className="card group flex flex-col gap-3 p-4 transition-all hover:-translate-y-0.5 hover:border-ring/60 hover:shadow-md"
              >
                <div className="flex items-start gap-3">
                  {c.badge && <ProjectLogo badge={c.badge} project={c.badge.line} size="md" />}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="truncate text-[15px] font-semibold text-foreground">
                        {c.name}
                      </span>
                      <span className="shrink-0 font-mono text-[11px] text-muted-foreground/80">
                        #{c.ticket}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[12px] text-muted-foreground">
                      {c.totalApps} {c.totalApps === 1 ? "app" : "apps"} · {c.releaseCount}{" "}
                      {c.releaseCount === 1 ? "release" : "releases"}
                    </div>
                  </div>

                  {c.latest && state ? (
                    <span
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-medium ring-1 ring-inset ${state.chip}`}
                      title={state.label}
                    >
                      <span className={`size-1.5 rounded-full ${state.dot}`} />
                      {c.latest.label}
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[12px] text-muted-foreground ring-1 ring-inset ring-border">
                      No releases
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {c.accounts.length === 0 ? (
                    <span className="text-[12px] text-muted-foreground/70">No store account yet</span>
                  ) : (
                    c.accounts.map((a) => (
                      <span
                        key={a.platform}
                        className="inline-flex items-center gap-1.5 rounded-md bg-muted/50 px-2 py-0.5 text-[12px] text-muted-foreground"
                      >
                        <StoreIcon platform={a.platform} size={13} />
                        <span className="max-w-[180px] truncate">{a.accountName || "—"}</span>
                      </span>
                    ))
                  )}
                </div>

                {c.latest && (
                  <div className="flex items-center justify-between border-t pt-2.5 text-[11px] text-muted-foreground/80">
                    <span>{state?.label}</span>
                    <span>
                      {c.latest.assignee ? `${c.latest.assignee} · ` : ""}
                      {formatDate(c.latest.date)}
                    </span>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
