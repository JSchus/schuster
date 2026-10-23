import { brandIcon } from "@/lib/brand-icon";

const VARIANTS = ["192", "512", "maskable-192", "maskable-512"] as const;

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return VARIANTS.map((size) => ({ size: `${size}.png` }));
}

/** PWA manifest icons: /icons/192.png, /icons/maskable-512.png, ... */
export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const name = (await params).size.replace(/\.png$/, "");
  const maskable = name.startsWith("maskable-");
  const px = Number(name.replace("maskable-", ""));
  return brandIcon(px, { maskable, rounded: !maskable });
}
