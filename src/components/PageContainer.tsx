"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Pages that use the full window width instead of the centred reading column. */
const FULL_WIDTH = new Set(["/", "/mail"]);

export function PageContainer({ children }: { children: ReactNode }) {
  const full = FULL_WIDTH.has(usePathname());
  return (
    <div
      className={
        full
          ? "px-4 py-6 lg:px-5 lg:py-7"
          : "mx-auto max-w-[1400px] px-5 py-6 lg:px-8 lg:py-7"
      }
    >
      {children}
    </div>
  );
}
