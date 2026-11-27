import type { NextConfig } from "next";

/** The L Games project's production address on Vercel. */
const L_GAMES_ORIGIN = "https://l-games-taupe.vercel.app";
/** The O Games project's production address on Vercel. */
const O_GAMES_ORIGIN = "https://o-games-phi.vercel.app";

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
  async redirects() {
    // The arcade's old address: old links and home-screen icons land on /l-games.
    return [
      { source: "/logans-games", destination: "/l-games", permanent: true },
      { source: "/logans-games/:path*", destination: "/l-games/:path*", permanent: true },
    ];
  },
  async rewrites() {
    // L Games and O Games are each their own Vercel project (repos JSchus/l-games and
    // JSchus/o-games, basePath /l-games and /o-games). Serving them through schuster.me keeps
    // the address, so players' saves (stored per site) carry over.
    return [
      { source: "/l-games", destination: `${L_GAMES_ORIGIN}/l-games` },
      { source: "/l-games/:path*", destination: `${L_GAMES_ORIGIN}/l-games/:path*` },
      { source: "/o-games", destination: `${O_GAMES_ORIGIN}/o-games` },
      { source: "/o-games/:path*", destination: `${O_GAMES_ORIGIN}/o-games/:path*` },
    ];
  },
};

export default nextConfig;
