import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

// The game's rules live in a plain script the browser loads; Node loads the same file.
const M = createRequire(import.meta.url)("../../public/logans-games/monster-packs/logic.js");

type State = ReturnType<typeof M.newState>;

describe("Monster Packs: Logan's rules", () => {
  type Card = { id: number; name: string; tier: number; series: number; event: boolean };

  it("has Logan's original 200 cards in 8 tiers, exactly as before", () => {
    const s1 = M.CARDS.filter((c: Card) => c.series === 1);
    expect(s1).toHaveLength(200);
    const perTier = M.TIERS.slice(0, 8).map((_: unknown, i: number) => s1.filter((c: Card) => c.tier === i).length);
    expect(perTier).toEqual([60, 45, 35, 25, 15, 10, 6, 4]);
    // Fingerprint of the original 200 (ids, names, stats, art) from before Series 2: saves depend on it.
    const original = s1.map(({ series, event, ...c }: Card & Record<string, unknown>) => (void series, void event, c));
    expect(createHash("sha256").update(JSON.stringify(original)).digest("hex")).toBe("c437874be6b5e233baf448c3f0aa26bc90279834db24fb8a944f13a6ffd51c1c");
  });

  it("adds Series 2: 100 new monsters, 3 new tiers and 10 event-only ones", () => {
    expect(M.CARDS).toHaveLength(300);
    expect(new Set(M.CARDS.map((c: Card) => c.name)).size).toBe(300);
    expect(M.TIERS.map((t: { name: string }) => t.name)).toEqual(["Basic", "Rare", "Epic", "Legendary", "Mythical", "God", "Original", "Goated", "Cosmic", "Galaxy", "Infinity"]);
    const s2 = M.CARDS.filter((c: Card) => c.series === 2);
    expect(s2.map((c: Card) => c.id)).toEqual(Array.from({ length: 100 }, (_, i) => 201 + i));
    const perTier = M.TIERS.map((_: unknown, i: number) => s2.filter((c: Card) => c.tier === i && !c.event).length);
    expect(perTier).toEqual([20, 15, 12, 8, 5, 3, 1, 1, 12, 8, 5]);
    expect(M.EVENT_CARDS).toHaveLength(10);
    expect(M.SERIES.map((x: { total: number }) => x.total)).toEqual([200, 100]);
  });

  it("charges Logan's pack prices", () => {
    expect(M.TIERS.map((t: { price: number }) => t.price)).toEqual([50, 75, 100, 150, 300, 1000, 2500, 5000, 10_000, 50_000, 250_000]);
    const s = { ...M.newState(), coins: 120 };
    const ok = M.openPack(s, 1, M.seeded(1));
    expect(ok.ok).toBe(true);
    expect(ok.state.coins).toBe(45);
    expect(M.openPack(ok.state, 1, M.seeded(2)).ok).toBe(false); // can't afford another
  });

  it("puts at least one card of the pack's tier (or better) in every pack", () => {
    const rng = M.seeded(42);
    for (let tier = 0; tier < M.TIERS.length; tier++) {
      for (let i = 0; i < 500; i++) {
        const tiers: number[] = M.rollPackTiers(tier, rng);
        expect(tiers).toHaveLength(5);
        expect(Math.max(...tiers)).toBeGreaterThanOrEqual(tier);
        expect(Math.min(...tiers)).toBeGreaterThanOrEqual(Math.max(0, tier - 2));
      }
    }
  });

  it("never lets you make coins just by buying packs and selling them", () => {
    const rng = M.seeded(7);
    for (let tier = 0; tier < M.TIERS.length; tier++) {
      let total = 0;
      const n = 20_000;
      for (let i = 0; i < n; i++) for (const t of M.rollPackTiers(tier, rng)) total += M.TIERS[t].sell * (rng() < M.SHINY_CHANCE ? 3 : 1);
      expect(total / n).toBeLessThan(M.TIERS[tier].price * 0.85);
    }
  });

  it("pays 1 trillion coins exactly once, when the 200th card arrives", () => {
    let s: State = { ...M.newState(), coins: 1e9 };
    // Own every card but #200.
    for (const c of M.CARDS) if (c.series === 1 && c.id !== 200) s.owned[c.id] = 1;
    expect(M.collectedCount(s)).toBe(199);
    const rng = M.seeded(3);
    let completedAt = -1;
    for (let i = 0; i < 20_000 && completedAt < 0; i++) {
      const res = M.openPack(s, 7, rng);
      s = res.state;
      if (res.completed) completedAt = i;
    }
    expect(completedAt).toBeGreaterThanOrEqual(0);
    expect(s.rewardClaimed).toBe(true);
    expect(s.coins).toBeGreaterThan(1e12);
    const before = s.coins;
    const again = M.openPack(s, 0, rng);
    expect(again.completed).toBe(false);
    expect(again.state.coins).toBe(before - 50);
  });

  it("gives one free Basic pack per day, resetting at midnight", () => {
    const morning = new Date(2026, 10, 8, 9, 0).getTime();
    const night = new Date(2026, 10, 8, 23, 59).getTime();
    const tomorrow = new Date(2026, 10, 9, 0, 1).getTime();
    const first = M.claimDaily(M.newState(), M.seeded(1), morning);
    expect(first.ok).toBe(true);
    expect(first.state.coins).toBe(M.START_COINS); // free
    expect(first.cards).toHaveLength(5);
    expect(M.claimDaily(first.state, M.seeded(1), night).ok).toBe(false);
    expect(M.canClaimDaily(first.state, tomorrow)).toBe(true);
    expect(M.msUntilMidnight(night)).toBe(60_000);
  });

  it("sells extras (never your last copy), shinies for 3×", () => {
    const s = { ...M.newState(), coins: 0, owned: { 1: 3, 150: 1 }, shiny: { 2: 2 } };
    expect(M.sellOne(s, 150, false).ok).toBe(false);
    const one = M.sellOne(s, 1, false);
    expect(one.state.coins).toBe(4);
    expect(M.sellValue(2, true)).toBe(12);
    expect(M.extrasValue(one.state)).toBe(4 + 12);
    const all = M.sellAllExtras(one.state);
    expect(all.earned).toBe(16);
    expect(all.state.owned[1]).toBe(1);
    expect(all.state.shiny[2]).toBe(1);
    expect(M.extras(all.state)).toEqual([]);
  });

  it("uses the type chart in battles", () => {
    expect(M.typeMultiplier("fire", "leaf")).toBe(1.5);
    expect(M.typeMultiplier("leaf", "fire")).toBeCloseTo(0.67);
    expect(M.typeMultiplier("water", "fire")).toBe(1.5);
    expect(M.typeMultiplier("shadow", "fire")).toBe(1);
    const fire = M.CARDS.find((c: { type: string }) => c.type === "fire");
    const leaf = M.CARDS.find((c: { type: string }) => c.type === "leaf");
    const d = M.damage(fire, leaf, () => 0.5);
    expect(d).toBe(Math.round(fire.power * 1.5));
  });

  it("plays out a duel until one monster faints, and pays more on harder levels", () => {
    const strong = M.CARDS.find((c: { tier: number }) => c.tier === 7).id;
    const weak = M.CARDS.find((c: { tier: number }) => c.tier === 0).id;
    const fight = M.duel(strong, weak, M.seeded(9));
    expect(fight.winner).toBe("player");
    expect(fight.hits.at(-1).hpB).toBe(0);
    const team = [1, 2, 3];
    expect(M.battleReward(team, 2)).toBeGreaterThan(M.battleReward(team, 0));
    expect(M.cpuTeam(team, 1, M.seeded(1))).toHaveLength(3);
  });

  it("never puts event-only monsters in ordinary packs", () => {
    const rng = M.seeded(11);
    let s: State = { ...M.newState(), coins: 1e15 };
    for (let i = 0; i < 300; i++) {
      const res = M.openPack(s, i % M.TIERS.length, rng);
      s = res.state;
      for (const c of res.cards) expect(M.CARD_BY_ID.get(c.id).event).toBe(false);
    }
  });

  it("sells the Weekend Event pack only on Saturdays and Sundays (Chicago time)", () => {
    const thu = Date.parse("2026-11-26T18:00:00Z");
    const sat = Date.parse("2026-11-28T18:00:00Z");
    const sunLateChicago = Date.parse("2026-11-30T05:30:00Z"); // 11:30 pm Sunday in Chicago
    expect(M.isEventDay(thu)).toBe(false);
    expect(M.isEventDay(sat)).toBe(true);
    expect(M.isEventDay(sunLateChicago)).toBe(true);
    expect(M.isEventDay(Date.parse("2026-11-30T06:30:00Z"))).toBe(false); // Monday 12:30 am
    expect(M.msUntilEventChange(thu)).toBe(Date.parse("2026-11-28T06:00:00Z") - thu); // Saturday midnight
    expect(M.msUntilEventChange(sat)).toBe(Date.parse("2026-11-30T06:00:00Z") - sat); // Monday midnight

    const rich = { ...M.newState(), coins: 10_000 };
    expect(M.openEventPack(rich, M.seeded(1), thu).ok).toBe(false);
    const res = M.openEventPack(rich, M.seeded(1), sat);
    expect(res.ok).toBe(true);
    expect(res.state.coins).toBe(10_000 - M.EVENT_PACK.price);
    expect(res.cards).toHaveLength(5);
    expect(M.CARD_BY_ID.get(res.cards[4].id).event).toBe(true);
    expect(M.openEventPack({ ...M.newState(), coins: 100 }, M.seeded(1), sat).ok).toBe(false);
  });

  it("pays 5 trillion once for Series 2, and 2 trillion for each complete shiny set", () => {
    let s: State = { ...M.newState(), coins: 1e9 };
    for (const c of M.CARDS) if (c.series === 2 && c.id !== 300) s.owned[c.id] = 1; // all but one event card
    const sat = Date.parse("2026-11-28T18:00:00Z");
    const rng = M.seeded(4);
    let won: { label: string; coins: number }[] = [];
    for (let i = 0; i < 5000 && !won.length; i++) {
      const res = M.openEventPack({ ...s, coins: 1e9 }, rng, sat);
      s = res.state;
      won = res.rewards;
    }
    expect(won).toEqual([{ label: "every one of the 100 Series 2 monsters", coins: 5e12 }]);
    expect(s.rewards.series2).toBe(true);
    expect(M.openEventPack({ ...s, coins: 1e9 }, rng, sat).rewards).toEqual([]);

    const shinyAll: State = { ...M.newState(), coins: 0 };
    for (const c of M.CARDS) if (c.series === 1 && c.id !== 1) shinyAll.shiny[c.id] = 1;
    expect(M.shinyCount(shinyAll, 1)).toBe(199);
    shinyAll.owned[1] = 1;
    let t = shinyAll;
    let shinyWin: { coins: number }[] = [];
    for (let i = 0; i < 20_000 && !shinyWin.some((w) => w.coins === 2e12); i++) {
      const res = M.openPack({ ...t, coins: 1e6 }, 0, rng);
      t = res.state;
      shinyWin = res.rewards;
    }
    expect(t.rewards.shiny1).toBe(true);
  });

  it("upgrades a version 1 save without losing anything", () => {
    const v1 = { v: 1, coins: 12_345, owned: { 1: 3, 200: 1 }, shiny: { 5: 1 }, lastDaily: "2026-11-25", rewardClaimed: true, packsOpened: 40, battlesWon: 7 };
    const s = M.loadState(JSON.stringify(v1));
    expect(s).toMatchObject({ v: 2, coins: 12_345, owned: { 1: 3, 200: 1 }, shiny: { 5: 1 }, lastDaily: "2026-11-25", rewardClaimed: true, packsOpened: 40, battlesWon: 7 });
    expect(s.rewards).toEqual({ series2: false, shiny1: false, shiny2: false });
    // An already-won Series 1 reward isn't paid again.
    expect(M.openPack({ ...s, coins: 100 }, 0, M.seeded(1)).rewards).toEqual([]);
  });

  it("saves and loads, and starts fresh from a broken save", () => {
    const s = M.openPack({ ...M.newState(), coins: 500 }, 0, M.seeded(5)).state;
    expect(M.loadState(JSON.stringify(s))).toEqual(s);
    expect(M.loadState("{oops")).toEqual(M.newState());
    expect(M.loadState(JSON.stringify({ v: 99 }))).toEqual(M.newState());
  });

  it("shows big numbers short", () => {
    expect(M.formatCoins(950)).toBe("950");
    expect(M.formatCoins(12_500)).toBe("12.5K");
    expect(M.formatCoins(3_200_000)).toBe("3.2M");
    expect(M.formatCoins(1e12)).toBe("1T");
  });
});
