import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  // Everything except static assets, PWA files and icons.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|icons/|manifest.webmanifest|sw.js|.*\\.(?:png|svg|jpg|webp|ico|txt)$).*)",
  ],
};
