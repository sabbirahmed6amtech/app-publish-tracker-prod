import Link from "next/link";
import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  meta,
  tags,
  actions,
  backHref,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  tags?: ReactNode;
  actions?: ReactNode;
  backHref?: string;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4 pb-5">
      <div className="min-w-0">
        {backHref && (
          <Link
            href={backHref}
            className="mb-1.5 inline-flex items-center gap-1 text-[12px] font-medium
                       text-muted-foreground hover:text-foreground"
          >
            ← Back
          </Link>
        )}
        {eyebrow && (
          <div className="text-[12px] font-medium text-muted-foreground">{eyebrow}</div>
        )}
        <h1 className="truncate text-[24px] font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        {meta && <div className="mt-1 text-[14px] text-muted-foreground">{meta}</div>}
        {tags && <div className="mt-2 flex flex-wrap items-center gap-1.5">{tags}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Tag({ children }: { children: ReactNode }) {
  return (
    <span
      className="rounded border border-border bg-muted/50 px-1.5 py-0.5
                 text-[12px] font-medium text-foreground/70"
    >
      {children}
    </span>
  );
}
