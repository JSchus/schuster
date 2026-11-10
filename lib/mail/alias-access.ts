import "server-only";
import { HttpError, parseId, requireContributor } from "@/lib/api";
import { getVisibleAlias } from "@/lib/db/mail";
import { env } from "@/lib/env";
import { isLive, splitAddress } from "./aliases";

/** An alias the signed-in member may send as (owner or group member), that's switched on. */
export async function sendableAlias(id: string) {
  const user = await requireContributor();
  const alias = await getVisibleAlias(user.id, parseId(id));
  if (!alias) throw new HttpError(404, "Not found");
  if (!isLive(alias)) throw new HttpError(400, "This alias is off, paused or expired. Turn it on first.");
  const domain = env().MAIL_DOMAIN;
  return { user, alias, domain, address: `${alias.localPart}@${domain}` };
}

export function assertOutside(email: string, domain: string) {
  if (splitAddress(email).domain === domain) throw new HttpError(400, `Pick someone outside @${domain}.`);
}
