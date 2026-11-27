import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  // Everything except static assets, PWA files, icons and the public L Games and O Games arcades
  // (served by its own Vercel project; see next.config.ts).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|icons/|manifest.webmanifest|sw.js|sw-range.js|emulatorjs/|l-games(?:/|$)|o-games(?:/|$)|.*\\.(?:png|svg|jpg|webp|ico|txt|mjs)$).*)",
  ],
};
