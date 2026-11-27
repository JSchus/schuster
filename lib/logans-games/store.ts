/**
 * Monster Packs real-money deals. Prices and contents live here, on the
 * server: the browser only ever sends which deal it wants.
 *
 * Pack keys are Monster Packs tier numbers ("0" Basic … "10" Infinity) or
 * "event" (Weekend Event pack).
 */

export type Grant = { packs: Record<string, number>; coins: number };
export type Offer = {
  id: OfferId;
  name: string;
  blurb: string;
  emoji: string;
  /** US cents. */
  cents: number;
  grant: Grant;
  /** Only once per device. */
  once?: boolean;
  /** Only on Saturdays and Sundays (Chicago). */
  weekendOnly?: boolean;
};
export type OfferId = "every-tier" | "starter" | "daily" | "weekend";

export const TIER_NAMES = ["Basic", "Rare", "Epic", "Legendary", "Mythical", "God", "Original", "Goated", "Cosmic", "Galaxy", "Infinity"];

const chicagoDay = (now: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
const chicagoWeekday = (now: Date) => new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short" }).format(now);
export const isWeekend = (now: Date) => ["Sat", "Sun"].includes(chicagoWeekday(now));

/** The daily deal's tier changes every day (Chicago), from Mythical up to Galaxy. */
export function dailyTier(now: Date): number {
  let h = 0;
  for (const ch of chicagoDay(now)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return 4 + (h % 6);
}

export function offer(id: string, now = new Date()): Offer | null {
  switch (id) {
    case "every-tier":
      return {
        id,
        name: "Every-tier bundle",
        blurb: `1 pack of every tier: ${TIER_NAMES[0]} all the way to ${TIER_NAMES[10]}!`,
        emoji: "🌈",
        cents: 999,
        grant: { packs: Object.fromEntries(TIER_NAMES.map((_, i) => [String(i), 1])), coins: 0 },
      };
    case "starter":
      return {
        id,
        name: "Starter pack",
        blurb: "3 Rare packs, 2 Epic packs and 2,000 coins. Only once!",
        emoji: "🚀",
        cents: 199,
        once: true,
        grant: { packs: { "1": 3, "2": 2 }, coins: 2000 },
      };
    case "daily": {
      const t = dailyTier(now);
      return {
        id,
        name: "Daily deal",
        blurb: `3 ${TIER_NAMES[t]} packs. A new deal every day!`,
        emoji: "⏰",
        cents: 99,
        grant: { packs: { [String(t)]: 3 }, coins: 0 },
      };
    }
    case "weekend":
      return {
        id,
        name: "Weekend mega deal",
        blurb: "5 Weekend Event packs, a Cosmic pack and 25,000 coins!",
        emoji: "🎉",
        cents: 499,
        weekendOnly: true,
        grant: { packs: { event: 5, "8": 1 }, coins: 25000 },
      };
    default:
      return null;
  }
}

export const OFFER_IDS: OfferId[] = ["every-tier", "starter", "daily", "weekend"];

/** Deals that can be bought right now. */
export function offersNow(now = new Date()): Offer[] {
  return OFFER_IDS.map((id) => offer(id, now)!).filter((o) => !o.weekendOnly || isWeekend(now));
}

export const price = (cents: number) => `$${(cents / 100).toFixed(2)}`;
