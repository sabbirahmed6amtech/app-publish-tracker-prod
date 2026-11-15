import type { Metadata } from "next";
import { ThemeToggle } from "@/components/ThemeToggle";
import { BrandMark } from "@/components/BrandMark";

export const metadata: Metadata = {
  title: "Store details · Publish Tracker",
  description: "Everything needed to publish your apps on Google Play and the App Store.",
  // A private link: keep it out of search engines and other sites' logs.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** The client's shell: no login, no internal navigation. */
export default function IntakeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-2.5 px-4 sm:px-6">
          <BrandMark className="size-7" />
          <span className="leading-tight">
            <span className="block text-[14px] font-semibold">Publish Tracker</span>
            <span className="block text-[11px] text-muted-foreground">Store details</span>
          </span>
          <ThemeToggle className="ml-auto" />
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
