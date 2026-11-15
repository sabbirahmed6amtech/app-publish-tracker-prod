"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SearchIcon } from "lucide-react";
import { Spinner } from "@/components/Spinner";

/**
 * Search as you type: the query lives in the URL (?q=), so results render on
 * the server and a search can be shared as a link.
 */
export function TrackerSearch({
  autoFocus = false,
  size = "lg",
}: {
  autoFocus?: boolean;
  size?: "lg" | "sm";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [pending, setPending] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setPending(false), [params]);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  function go(value: string) {
    const target = value.trim() ? `/track?q=${encodeURIComponent(value.trim())}` : "/track";
    setPending(true);
    if (pathname === "/track") router.replace(target, { scroll: false });
    else router.push(target);
  }

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        if (timer.current) clearTimeout(timer.current);
        go(q);
      }}
      className={`flex items-center gap-2.5 rounded-xl border bg-card shadow-xs transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 ${
        size === "lg" ? "h-12 px-4" : "h-9 px-3"
      }`}
    >
      <SearchIcon
        className={`shrink-0 text-muted-foreground ${size === "lg" ? "size-5" : "size-4"}`}
      />
      <input
        value={q}
        autoFocus={autoFocus}
        onChange={(e) => {
          const value = e.target.value;
          setQ(value);
          if (pathname !== "/track") return;
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => go(value), 300);
        }}
        placeholder="Client name, ticket number or app name"
        aria-label="Search for a client"
        autoComplete="off"
        className={`min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground ${
          size === "lg" ? "text-[16px]" : "text-[14px]"
        }`}
      />
      {pending && <Spinner />}
    </form>
  );
}
