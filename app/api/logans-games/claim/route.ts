import { z } from "zod";
import { HttpError, handle, parseJson } from "@/lib/api";
import { getPurchase, markGranted } from "@/lib/db/game-store";
import { getStripe } from "@/lib/logans-games/stripe";

export const maxDuration = 10;

const bodySchema = z.object({ session: z.string().regex(/^cs_[A-Za-z0-9_]{8,200}$/, "Bad session"), device: z.string().regex(/^[0-9a-f-]{36}$/, "Bad device") });

/**
 * After paying, the game asks for its packs. They're only handed out when
 * Stripe says the session is paid in full, to the device that started it.
 * Asking again returns the same packs marked `already` (the game keeps a
 * list of what it has added, so nothing is added twice).
 */
export const POST = handle(async (req: Request) => {
  const stripe = getStripe();
  if (!stripe) throw new HttpError(503, "The store isn't open yet.");
  const body = await parseJson(req, bodySchema);
  const row = await getPurchase(body.session);
  if (!row || row.deviceId !== body.device) throw new HttpError(404, "We couldn't find that purchase on this device.");
  if (row.grantedAt) return Response.json({ offer: row.offer, grant: row.grant, already: true });
  const s = await stripe.getCheckout(row.id);
  if (!s.paid) throw new HttpError(402, "The payment hasn't gone through yet.");
  if (s.cents !== row.cents || s.metadata.device !== row.deviceId) throw new HttpError(409, "That payment doesn't match this deal.");
  const first = await markGranted(row.id);
  return Response.json({ offer: row.offer, grant: row.grant, already: !first });
});
