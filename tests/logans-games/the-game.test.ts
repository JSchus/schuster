import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

// The game's rules live in a plain script the browser loads; Node loads the same file.
const G = createRequire(import.meta.url)("../../public/logans-games/the-game/logic.js");

type Inv = ({ id: string; n: number } | null)[];
const id = (key: string) => G.BLOCK[key].id;

describe("THE GAME: Logan's rules", () => {
  describe("worlds", () => {
    const world = G.generateWorld(G.seedFrom("logan"));
    const at = (x: number, y: number) => world.tiles[y * world.w + x];

    it("always makes the same world from the same seed, and different ones from others", () => {
      expect(G.generateWorld(G.seedFrom("logan")).tiles).toEqual(world.tiles);
      expect(G.generateWorld(G.seedFrom("other")).tiles).not.toEqual(world.tiles);
    });

    it("has sky on top, bedrock at the bottom and a safe place to start", () => {
      expect(world.w).toBe(512);
      expect(world.h).toBe(128);
      for (let x = 0; x < world.w; x++) {
        expect(at(x, 0)).toBe(0);
        expect(at(x, world.h - 1)).toBe(id("bedrock"));
      }
      const { x, y } = world.spawn;
      expect(G.blockById(at(Math.floor(x), y)).solid).toBe(true); // standing on ground
      for (let k = 1; k <= 2; k++) expect(G.blockById(at(Math.floor(x), y - k)).solid).toBe(false); // room to stand
    });

    it("has grass, desert and snow lands, trees, caves, water and lava", () => {
      const biomes = new Set(Array.from({ length: 512 }, (_, x) => G.biomeAt(G.seedFrom("logan"), x)));
      expect(biomes).toEqual(new Set(["grass", "desert", "snow"]));
      const seen = new Set(world.tiles);
      for (const k of ["grass", "dirt", "stone", "sand", "snow", "log", "leaves", "water", "lava", "coal_ore", "iron_ore", "gold_ore", "gem_ore"]) expect(seen.has(id(k))).toBe(true);
    });

    it("puts rare ores deeper: Starstone only near the bottom, coal everywhere underground", () => {
      const depthOf = (key: string) => {
        const ys: number[] = [];
        world.tiles.forEach((t: number, i: number) => t === id(key) && ys.push(Math.floor(i / world.w)));
        return Math.min(...ys) / world.h;
      };
      expect(depthOf("gem_ore")).toBeGreaterThan(0.75);
      expect(depthOf("gold_ore")).toBeGreaterThan(0.6);
      expect(depthOf("coal_ore")).toBeLessThan(depthOf("iron_ore"));
    });

    it("saves worlds small and loads them back exactly", () => {
      const w = G.newWorld({ id: "w1", name: "Castle", mode: "creative", seedText: "abc" }, 1000);
      w.tiles[5] = id("glass");
      const saved = G.saveWorld(w);
      const text = JSON.stringify(saved);
      expect(text.length).toBeLessThan(120_000); // fits easily on a phone
      const back = G.loadWorld(JSON.parse(text));
      expect(back.tiles).toEqual(w.tiles);
      expect(back).toMatchObject({ name: "Castle", mode: "creative", player: w.player });
      expect(() => G.loadWorld({ v: 9 })).toThrow();
    });

    it("starts Survival with a few apples and Creative with an empty bag", () => {
      const s = G.newWorld({ id: "a", name: "S", mode: "survival", seedText: "x" });
      const c = G.newWorld({ id: "b", name: "C", mode: "creative", seedText: "x" });
      expect(G.count(s.inventory, "apple")).toBe(3);
      expect(c.inventory.every((slot: unknown) => slot === null)).toBe(true);
      expect(s.player).toMatchObject({ health: 20, hunger: 20 });
    });
  });

  describe("bag and crafting", () => {
    it("stacks items up to 64 and tools one at a time", () => {
      let inv: Inv = G.emptyInventory();
      inv = G.addItem(inv, "dirt", 100).inv;
      expect(inv.slice(0, 2)).toEqual([{ id: "dirt", n: 64 }, { id: "dirt", n: 36 }]);
      inv = G.addItem(inv, "wood_pick", 2).inv;
      expect(inv.filter((s) => s?.id === "wood_pick").map((s) => s!.n)).toEqual([1, 1]);
      expect(G.removeItem(inv, "dirt", 101)).toBeNull();
      expect(G.count(G.removeItem(inv, "dirt", 40), "dirt")).toBe(60);
      const full = G.addItem(G.emptyInventory(), "stone", 64 * 32 + 5);
      expect(full.left).toBe(5);
    });

    it("crafts from logs to a wooden pickaxe at a workbench", () => {
      let inv: Inv = G.addItem(G.emptyInventory(), "log", 3).inv;
      const recipe = (out: string) => G.RECIPES.find((r: { out: string }) => r.out === out);
      inv = G.craft(inv, recipe("planks")).inv;
      inv = G.craft(inv, recipe("planks")).inv;
      inv = G.craft(inv, recipe("planks")).inv;
      expect(G.count(inv, "planks")).toBe(12);
      inv = G.craft(inv, recipe("stick")).inv;
      expect(G.craft(inv, recipe("wood_pick")).reason).toMatch(/Workbench/);
      const done = G.craft(inv, recipe("wood_pick"), ["workbench"]);
      expect(done.ok).toBe(true);
      expect(G.count(done.inv, "wood_pick")).toBe(1);
      expect(G.count(done.inv, "planks")).toBe(7);
      expect(G.craft(G.emptyInventory(), recipe("torch")).reason).toMatch(/Need 1 Coal/);
    });

    it("smelts at a furnace and makes armor", () => {
      const r = (out: string) => G.RECIPES.find((x: { out: string }) => x.out === out);
      let inv: Inv = G.addItem(G.addItem(G.emptyInventory(), "iron_ore", 8).inv, "coal", 8).inv;
      expect(G.craft(inv, r("iron_bar"), ["workbench"]).ok).toBe(false);
      for (let i = 0; i < 8; i++) inv = G.craft(inv, r("iron_bar"), ["furnace"]).inv;
      expect(G.count(inv, "iron_bar")).toBe(8);
      inv = G.craft(inv, r("iron_armor"), ["workbench"]).inv;
      expect(G.count(inv, "iron_armor")).toBe(1);
      // Every recipe makes something that exists.
      for (const rec of G.RECIPES) expect(G.ITEMS[rec.out]).toBeDefined();
    });
  });

  describe("mining", () => {
    it("is faster with the right tool, and some blocks need a good enough pickaxe", () => {
      expect(G.mineTime(id("dirt"), null)).toBe(0.5);
      expect(G.mineTime(id("log"), "stone_axe")).toBeLessThan(G.mineTime(id("log"), null));
      expect(G.mineTime(id("stone"), "iron_pick")).toBeLessThan(G.mineTime(id("stone"), "wood_pick"));
      expect(G.dropOf(id("stone"), null)).toBeNull(); // stone by hand: nothing
      expect(G.dropOf(id("stone"), "wood_pick")).toBe("cobble");
      expect(G.dropOf(id("iron_ore"), "wood_pick")).toBeNull();
      expect(G.dropOf(id("iron_ore"), "stone_pick")).toBe("iron_ore");
      expect(G.dropOf(id("gem_ore"), "stone_pick")).toBeNull();
      expect(G.dropOf(id("gem_ore"), "iron_pick")).toBe("gem");
      expect(G.dropOf(id("grass"), null)).toBe("dirt");
      expect(G.mineTime(id("bedrock"), "gem_pick")).toBe(Infinity);
      expect(G.mineTime(id("bedrock"), null, true)).toBeLessThan(1); // creative breaks anything
    });
  });

  describe("health, hunger, day and night", () => {
    it("gets hungry slowly, heals when full and hurts when starving", () => {
      let body = { health: 10, hunger: 20 };
      body = G.tickBody(body, 30);
      expect(body.hunger).toBe(19);
      expect(body.health).toBe(20); // healed 1 every 3s
      let starving = { health: 20, hunger: 0 };
      starving = G.tickBody(starving, 9);
      expect(starving.health).toBe(17);
      expect(G.eat({ health: 20, hunger: 5 }, "cooked_meat").hunger).toBe(13);
      expect(G.eat({ health: 20, hunger: 18 }, "cooked_meat").hunger).toBe(20);
    });

    it("armor softens hits, and long falls hurt", () => {
      expect(G.hurtBy(10, null)).toBe(10);
      expect(G.hurtBy(10, "iron_armor")).toBe(6);
      expect(G.hurtBy(10, "gem_armor")).toBe(4);
      expect(G.hurtBy(1, "gem_armor")).toBe(1);
      expect(G.fallDamage(3)).toBe(0);
      expect(G.fallDamage(8)).toBe(4);
    });

    it("has day and night: night is when creatures come out", () => {
      const D = G.DAY_SECONDS;
      expect(G.isNight(D * 0.3)).toBe(false);
      expect(G.isNight(D * 0.7)).toBe(true);
      expect(G.daylight(D * 0.3)).toBe(1);
      expect(G.daylight(D * 0.75)).toBeLessThan(0.5);
      expect(G.daylight(D * 0.75)).toBeGreaterThan(0.2); // moonlight: you can still see
      expect(G.daylight(D * 1.3)).toBe(1); // next day
      expect((Object.values(G.CREATURES) as { night?: boolean }[]).some((c) => c.night)).toBe(true);
    });
  });
});
