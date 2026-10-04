"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Building2Icon, PackageIcon, SearchIcon, TagIcon } from "lucide-react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export type SearchItem = {
  id: string;
  kind: "client" | "release" | "app";
  label: string;
  sub: string;
  href: string;
};

const GROUPS = [
  { kind: "client", heading: "Clients", icon: Building2Icon },
  { kind: "release", heading: "Releases", icon: TagIcon },
  { kind: "app", heading: "Apps", icon: PackageIcon },
] as const;

/**
 * Sticky bar over every page: search (⌘K / Ctrl+K) to jump anywhere, and the
 * actions that make sense from any page, like adding a client.
 */
export function TopBar({ items, actions }: { items: SearchItem[]; actions?: ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key?.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/85 px-5 backdrop-blur lg:px-8">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border bg-card px-2.5 text-[13px] text-muted-foreground shadow-xs transition-colors hover:border-ring/60"
        >
          <SearchIcon className="size-4 shrink-0" />
          <span className="flex-1 truncate text-left">Search clients, releases, apps…</span>
          <kbd className="hidden rounded border bg-muted px-1.5 font-mono text-[10px] sm:inline">
            ⌘K
          </kbd>
        </button>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Search"
        description="Jump to a client, release or app"
      >
        <Command>
          <CommandInput placeholder="Type a client, version, app or ticket…" />
          <CommandList>
            <CommandEmpty>Nothing matches.</CommandEmpty>
            {GROUPS.map(({ kind, heading, icon: Icon }) => {
              const group = items.filter((i) => i.kind === kind);
              if (group.length === 0) return null;
              return (
                <CommandGroup key={kind} heading={heading}>
                  {group.map((item) => (
                    <CommandItem
                      key={item.id}
                      value={`${item.label} ${item.sub} ${item.id}`}
                      onSelect={() => {
                        setOpen(false);
                        router.push(item.href);
                      }}
                    >
                      <Icon className="size-4 text-muted-foreground" />
                      <span className="truncate">{item.label}</span>
                      <span className="ml-auto truncate text-[12px] text-muted-foreground">
                        {item.sub}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
