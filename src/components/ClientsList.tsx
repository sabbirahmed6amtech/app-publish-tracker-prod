"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SearchIcon } from "lucide-react";
import { RELEASE_STATES, formatDate } from "@/lib/constants";
import { StoreIcon } from "@/components/StoreIcon";
import type { Platform, ReleaseState } from "@/lib/types";

export type ClientCard = {
  id: string;
  ticket: string;
  name: string;
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
        <div className="space-y-2.5">
          {filtered.map((c) => (
            <Link
              key={c.id}
              href={`/clients/${c.id}`}
              className="card block px-4 py-3.5 transition-colors hover:border-ring/60"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[15px] font-semibold text-foreground">{c.name}</span>
                    <span className="font-mono text-[11px] text-muted-foreground/80">#{c.ticket}</span>
                  </div>
                  {/* one element per account — joined spaces collapse in HTML
                      and run two account names together */}
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-muted-foreground">
                    {c.accounts.length === 0 ? (
                      <span className="text-muted-foreground/80">No store account yet</span>
                    ) : (
                      c.accounts.map((a) => (
                        <span key={a.platform} className="inline-flex items-center gap-1.5">
                          <StoreIcon platform={a.platform} size={13} />
                          <span className="truncate">{a.accountName || "—"}</span>
                        </span>
                      ))
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-5 text-[12px] text-muted-foreground">
                  <span>
                    {c.totalApps} {c.totalApps === 1 ? "app" : "apps"} · {c.releaseCount}{" "}
                    {c.releaseCount === 1 ? "release" : "releases"}
                  </span>
                  {c.latest ? (
                    <span className="text-right">
                      <span className="flex items-center justify-end gap-1.5 text-[13px] font-medium text-foreground">
                        <span className={`size-2 rounded-full ${RELEASE_STATES[c.latest.state].dot}`} />
                        {c.latest.label}
                      </span>
                      <span className="text-[11px] text-muted-foreground/80">
                        {c.latest.assignee ? `${c.latest.assignee} · ` : ""}
                        {formatDate(c.latest.date)}
                      </span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground/80">No releases</span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
