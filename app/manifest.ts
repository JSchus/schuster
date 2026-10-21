import type { MetadataRoute } from "next";

/** Web app manifest → /manifest.webmanifest (installable on Android & desktop). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Schuster Media",
    short_name: "Schuster",
    description: "Books, video, music, games and files for family and friends.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#18181b",
    theme_color: "#3b4fd8",
    categories: ["entertainment", "books", "music", "games"],
    icons: [
      { src: "/icons/192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [{ name: "Upload", url: "/upload", icons: [{ src: "/icons/192.png", sizes: "192x192" }] }],
  };
}
