import { z } from "zod";
import { HttpError, handle, parseJson } from "@/lib/api";
import { addPurchase, grantedOffers, recentCheckouts } from "@/lib/db/game-store";
import { isWeekend, offer, price } from "@/lib/logans-games/store";
import { getStripe } from "@/lib/logans-games/stripe";

export const maxDuration = 10;

const bodySchema = z.object({ offer: z.string().max(40), device: z.string().regex(/^[0-9a-f-]{36}$/, "Bad device") });

/** Start a Stripe checkout for a deal. The price comes from the server, never the browser. */
export const POST = handle(async (req: Request) => {
  const stripe = getStripe();
  if (!stripe) throw new HttpError(503, "The store isn't open yet.");
  const body = await parseJson(req, bodySchema);
  const now = new Date();
  const deal = offer(body.offer, now);
  if (!deal) throw new HttpError(404, "That deal doesn't exist.");
  if (deal.weekendOnly && !isWeekend(now)) throw new HttpError(400, "That deal is only on Saturdays and Sundays.");
  if (deal.once && (await grantedOffers(body.device)).includes(deal.id)) throw new HttpError(409, "You already got this deal!");
  if ((await recentCheckouts(body.device, new Date(now.getTime() - 3_600_000))) >= 20) throw new HttpError(429, "Too many tries. Please wait a bit.");

  const origin = new URL(req.url).origin;
  const game = `${origin}/logans-games/monster-packs`;
  const session = await stripe.createCheckout({
    name: `Monster Packs: ${deal.name}`,
    description: deal.blurb,
    cents: deal.cents,
    successUrl: `${game}?paid={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${game}?canceled=1`,
    metadata: { offer: deal.id, device: body.device },
  });
  await addPurchase({ id: session.id, offer: deal.id, cents: deal.cents, grant: deal.grant, deviceId: body.device });
  return Response.json({ url: session.url, price: price(deal.cents) }, { status: 201 });
});
