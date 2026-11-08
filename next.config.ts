import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Covers and media are served from S3 via presigned URLs, never through
  // Next.js image optimisation (that would proxy bytes through Vercel).
  images: { unoptimized: true },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        // Imported by sw.js; browsers re-check it on every service-worker update.
        source: "/sw-range.js",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
    ];
  },
  async rewrites() {
    // Logan's games are static folders: /logans-games/monster-packs serves its index.html.
    return [{ source: "/logans-games/:slug", destination: "/logans-games/:slug/index.html" }];
  },
};

export default nextConfig;
