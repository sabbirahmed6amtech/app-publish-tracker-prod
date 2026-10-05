"use client";

import { useMemo, useState } from "react";
import { SearchIcon, PlusIcon, LifeBuoyIcon, ChevronDownIcon } from "lucide-react";
import { DeleteButton } from "@/components/RowActions";
import { CopyButton } from "@/components/CopyButton";
import { SupportArticleDialog } from "@/components/dialogs/SupportArticleDialog";
import { deleteSupportArticle } from "@/lib/actions";
import type { SupportArticle } from "@/lib/types";

export function SupportList({ articles }: { articles: SupportArticle[] }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const categories = useMemo(
    () => [...new Set(articles.map((a) => a.category))].sort((a, b) => a.localeCompare(b)),
    [articles],
  );

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of articles) m.set(a.category, (m.get(a.category) ?? 0) + 1);
    return m;
  }, [articles]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return articles.filter((a) => {
      if (cat && a.category !== cat) return false;
      if (needle && !`${a.category} ${a.title} ${a.body}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [articles, q, cat]);

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-[13px] text-muted-foreground">
          Add a fix whenever you solve something new, so nobody figures it out twice.
        </p>
        <SupportArticleDialog
          categories={categories}
          trigger={
            <>
              <PlusIcon className="size-4" /> New entry
            </>
          }
          className="btn btn-primary shrink-0"
        />
      </div>

      <div className="card mb-3 flex items-center gap-2 px-3 py-2">
        <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search issues and solutions"
          className="field flex-1 border-0 shadow-none"
          autoComplete="off"
        />
        {q && (
          <button className="btn btn-ghost px-2 py-1" onClick={() => setQ("")}>
            Clear
          </button>
        )}
      </div>

      {categories.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          <Chip active={cat === null} onClick={() => setCat(null)}>
            All <span className="opacity-60">{articles.length}</span>
          </Chip>
          {categories.map((c) => (
            <Chip key={c} active={cat === c} onClick={() => setCat(c)}>
              {c} <span className="opacity-60">{counts.get(c)}</span>
            </Chip>
          ))}
        </div>
      )}

      {articles.length === 0 ? (
        <div className="card flex flex-col items-center px-6 py-14 text-center">
          <LifeBuoyIcon className="mb-2 size-6 text-muted-foreground/60" />
          <p className="text-[14px] font-medium text-foreground">No entries yet.</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Add the first common issue and its fix.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card px-6 py-12 text-center text-[13px] text-muted-foreground">
          Nothing matches that.
        </div>
      ) : (
        <div className="card divide-y divide-border overflow-hidden">
          {filtered.map((a) => {
            const isOpen = open.has(a.id);
            return (
              <div key={a.id}>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => toggle(a.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left"
                  >
                    <ChevronDownIcon
                      className={`size-4 shrink-0 text-muted-foreground transition-transform ${
                        isOpen ? "rotate-180" : ""
                      }`}
                    />
                    <span className="truncate text-[14px] font-medium text-foreground">
                      {a.title}
                    </span>
                    <span className="ml-auto hidden shrink-0 pl-2 text-[11px] uppercase tracking-wide text-muted-foreground/70 sm:inline">
                      {a.category}
                    </span>
                  </button>
                  <div className="flex shrink-0 items-center gap-0.5 pr-2">
                    <SupportArticleDialog
                      article={a}
                      categories={categories}
                      trigger="Edit"
                      className="btn btn-ghost h-7 px-2"
                    />
                    <DeleteButton
                      label="✕"
                      confirmText={`Delete "${a.title}"?`}
                      action={() => deleteSupportArticle(a.id)}
                    />
                  </div>
                </div>

                {isOpen && (
                  <div className="px-4 pb-4 pl-11">
                    <div className="relative rounded-lg border bg-muted/20 p-3.5 pr-10">
                      <div className="absolute right-2 top-2">
                        <CopyButton value={a.body} label="Copy solution" />
                      </div>
                      <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/85">
                        {a.body}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-[12px] font-medium ring-1 ring-inset transition-colors ${
        active
          ? "bg-foreground text-background ring-transparent"
          : "bg-muted/50 text-muted-foreground ring-border hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
