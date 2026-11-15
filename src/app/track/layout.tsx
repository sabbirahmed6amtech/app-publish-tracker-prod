import type { Metadata } from "next";
import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";
import { BrandMark } from "@/components/BrandMark";

export const metadata: Metadata = {
  title: "Status tracker · Publish Tracker",
  description: "Where each app stands in the Play Store and App Store.",
  // Client names shouldn't turn up in search engines.
  robots: { index: false, follow: false },
};

/** The public shell: no login, no internal navigation. */
export default function TrackLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-2.5 px-4 sm:px-6">
          <Link href="/track" className="flex items-center gap-2.5">
            <BrandMark className="size-7" />
            <span className="leading-tight">
              <span className="block text-[14px] font-semibold">Publish Tracker</span>
              <span className="block text-[11px] text-muted-foreground">App status</span>
            </span>
          </Link>
          <ThemeToggle className="ml-auto" />
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">{children}</main>
      <footer className="py-6 text-center text-[11px] text-muted-foreground">
        Status updates as the team moves each app through review.
      </footer>
    </div>
  );
}
