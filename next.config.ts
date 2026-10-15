import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // Keep visited and prefetched pages in the browser for a minute so switching tabs is instant. Writes still show up:
    // server actions revalidate (which clears this cache) and LiveRefresh calls router.refresh() on realtime events.
    staleTimes: { dynamic: 60, static: 300 },
  },
};

export default nextConfig;
