import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.VERCEL ? {} : { output: "standalone" as const }),
  // Pages that were folded into the four main sections.
  async redirects() {
    return [
      { source: "/board", destination: "/", permanent: false },
      { source: "/apps", destination: "/reports?tab=sheet", permanent: false },
      { source: "/team", destination: "/settings", permanent: false },
      { source: "/import", destination: "/settings?tab=data", permanent: false },
    ];
  },
  serverExternalPackages: ["pg"],
  experimental: {
    serverActions: { bodySizeLimit: "4mb" },
    // Every page is force-dynamic, and Next's default client cache for dynamic
    // segments is 0s — so going back to a page you just left refetched it from
    // scratch. Holding the payload briefly makes revisits instant.
    staleTimes: { dynamic: 30, static: 180 },
  },
};

export default nextConfig;
