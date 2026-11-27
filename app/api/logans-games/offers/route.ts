import { handle } from "@/lib/api";
import { grantedOffers } from "@/lib/db/game-store";
import { offersNow, price } from "@/lib/logans-games/store";
import { getStripe } from "@/lib/logans-games/stripe";

export const maxDuration = 10;
export const dynamic = "force-dynamic";

const DEVICE = /^[0-9a-f-]{36}$/;

/** Today's Monster Packs deals, and whether the store is open. */
export const GET = handle(async (req: Request) => {
  const device = new URL(req.url).searchParams.get("device") ?? "";
  const had = DEVICE.test(device) && getStripe() ? await grantedOffers(device) : [];
  const offers = offersNow().map((o) => ({ ...o, price: price(o.cents), soldOut: !!o.once && had.includes(o.id) }));
  return Response.json({ open: !!getStripe(), offers }, { headers: { "Cache-Control": "no-store" } });
});
