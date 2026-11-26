import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

// The game's rules live in a plain script the browser loads; Node loads the same file.
const S = createRequire(import.meta.url)("../../public/logans-games/space-lane-shooter/logic.js");

type State = ReturnType<typeof S.newState>;
const withCoins = (coins: number): State => ({ ...S.newState(), coins });

describe("Space Lane Shooter: Logan's rules", () => {
  it("starts with Captain Cat, no coins and no upgrades", () => {
    const s = S.newState();
    expect(s).toMatchObject({ coins: 0, pilot: "cat", pilots: ["cat"], upgrades: { damage: 0, fireRate: 0, armor: 0, powerTime: 0 } });
    expect(S.LANES).toBe(5);
    expect(S.PILOTS.map((p: { emoji: string }) => p.emoji)).toEqual(["🐱", "🐶", "🐼", "🦊", "🦉", "🐰"]);
  });

  it("buys pilots with star coins and switches back for free", () => {
    expect(S.choosePilot(S.newState(), "dog").ok).toBe(false);
    let s = S.choosePilot(withCoins(350), "dog").state;
    expect(s).toMatchObject({ coins: 50, pilot: "dog", pilots: ["cat", "dog"] });
    s = S.choosePilot(s, "cat").state;
    expect(s).toMatchObject({ coins: 50, pilot: "cat" });
    expect(S.choosePilot(s, "dragon").ok).toBe(false);
  });

  it("upgrades step up in price and stop at the max", () => {
    let s = withCoins(10_000);
    const paid: number[] = [];
    for (let i = 0; i < 5; i++) {
      paid.push(S.upgradeCost(s, "damage"));
      s = S.buyUpgrade(s, "damage").state;
    }
    expect(paid).toEqual([100, 250, 500, 900, 1500]);
    expect(S.upgradeCost(s, "damage")).toBeNull();
    expect(S.buyUpgrade(s, "damage").ok).toBe(false);
    expect(s.coins).toBe(10_000 - 3250);
    expect(S.buyUpgrade(S.newState(), "armor").ok).toBe(false);
  });

  it("makes the ship stronger with upgrades and each pilot's power", () => {
    const base = S.shipStats(S.newState());
    expect(base).toMatchObject({ damage: 1, hearts: 4, coinMult: 1, pierce: false }); // Cat: +1 heart
    const upgraded = { ...S.newState(), upgrades: { damage: 2, fireRate: 2, armor: 3, powerTime: 2 } };
    const u = S.shipStats(upgraded);
    expect(u.damage).toBe(2);
    expect(u.hearts).toBe(7);
    expect(u.shotsPerSecond).toBeGreaterThan(base.shotsPerSecond);
    expect(u.powerSeconds).toBeGreaterThan(base.powerSeconds);
    const as = (pilot: string) => S.shipStats({ ...S.newState(), pilot });
    expect(as("dog").shotsPerSecond).toBeCloseTo(base.shotsPerSecond * 1.25);
    expect(as("dog").hearts).toBe(3);
    expect(as("panda").shieldSeconds).toBe(base.shieldSeconds * 2);
    expect(as("fox").coinMult).toBe(2);
    expect(as("owl").pierce).toBe(true);
    expect(as("bunny").dropChance).toBe(base.dropChance * 2);
  });

  it("has a boss every 5 levels, taking turns and getting tougher", () => {
    expect([1, 4, 5, 9, 10].map(S.isBossLevel)).toEqual([false, false, true, false, true]);
    expect([5, 10, 15, 20, 25].map((l) => S.bossFor(l).name)).toEqual(["Queen Bee", "Mega Shark", "Robo-Rooster", "Cosmic Whale", "Queen Bee"]);
    expect(S.bossFor(25).hp).toBeGreaterThan(S.bossFor(5).hp);
    expect(S.bossFor(10).coins).toBeGreaterThan(S.bossFor(5).coins);
  });

  it("plans levels that get longer, busier and bring new enemies", () => {
    const one = S.levelPlan(1, S.seeded(1));
    const six = S.levelPlan(6, S.seeded(1));
    expect(six.length).toBeGreaterThan(one.length);
    expect(new Set(one.map((e: { type: string }) => e.type))).toEqual(new Set(["bee"]));
    expect(new Set(S.levelPlan(9, S.seeded(2)).map((e: { type: string }) => e.type)).size).toBeGreaterThan(2);
    for (const plan of [one, six]) {
      for (let i = 1; i < plan.length; i++) {
        expect(plan[i].at).toBeGreaterThan(plan[i - 1].at);
        expect(plan[i].lane).not.toBe(plan[i - 1].lane);
      }
      for (const e of plan) {
        expect(e.lane).toBeGreaterThanOrEqual(0);
        expect(e.lane).toBeLessThan(5);
      }
    }
    expect(S.enemyAt("bee", 11).hp).toBeGreaterThan(S.enemyAt("bee", 1).hp);
  });

  it("drops every kind of power-up", () => {
    const rng = S.seeded(3);
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) seen.add(S.pickPowerup(rng));
    expect(seen).toEqual(new Set(["triple", "shield", "laser", "bomb", "heart"]));
  });

  it("banks star coins and keeps the top 5 scores", () => {
    let s = S.newState();
    const ranks: (number | null)[] = [];
    for (const [i, score] of [300, 900, 100, 500, 700, 200, 50].entries()) {
      const res = S.finishRun(s, { score, level: i + 1, coins: 10 }, 1000 + i);
      s = res.state;
      ranks.push(res.rank);
    }
    expect(s.coins).toBe(70);
    expect(s.runs).toBe(7);
    expect(s.bestLevel).toBe(7);
    expect(s.scores.map((x: { score: number }) => x.score)).toEqual([900, 700, 500, 300, 200]);
    expect(ranks).toEqual([1, 1, 3, 2, 2, 5, null]);
    expect(S.finishRun(s, { score: 5000, level: 1, coins: 0 }).best).toBe(true);
  });

  it("saves and loads, and starts fresh from a broken save", () => {
    const s = S.finishRun(S.buyUpgrade(withCoins(500), "damage").state, { score: 123, level: 3, coins: 40 }, 5).state;
    expect(S.loadState(JSON.stringify(s))).toEqual(s);
    expect(S.loadState("nope")).toEqual(S.newState());
    expect(S.loadState(JSON.stringify({ v: 3 }))).toEqual(S.newState());
  });
});
