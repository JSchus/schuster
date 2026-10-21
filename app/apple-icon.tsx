import { brandIcon } from "@/lib/brand-icon";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** iOS home-screen icon (iOS applies its own rounding). */
export default function AppleIcon() {
  return brandIcon(180);
}
