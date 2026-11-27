/* THE GAME: rules for Logan's block-building sandbox (no page code).
 *
 * A side-view world of blocks: dig, build, craft, and (in Survival) eat,
 * stay safe at night and find rare gems deep down. Everything here is
 * pure: blocks, items, recipes, world generation, mining speed, health
 * and hunger, day and night, inventories and saving. game.js does the
 * drawing and controls. Loaded as window.TheGame; tests use module.exports.
 */
(function (root) {
  /* ---------------------------------------------------------------- */
  /* Blocks                                                            */
  /* ---------------------------------------------------------------- */

  /**
   * Block ids are bytes in the world. `hard` is seconds to break by hand,
   * `tool` the tool that's fast on it, `tier` the tool level needed to get
   * anything out of it (0 hand, 1 wood, 2 stone, 3 iron), `drop` what you get.
   */
  const BLOCKS = [
    { id: 0, key: "air", name: "Air", solid: false },
    { id: 1, key: "grass", name: "Grass", color: "#5fbf4a", top: "#86e06a", solid: true, hard: 0.6, tool: "shovel", drop: "dirt" },
    { id: 2, key: "dirt", name: "Dirt", color: "#8a5a35", solid: true, hard: 0.5, tool: "shovel" },
    { id: 3, key: "stone", name: "Stone", color: "#7d808a", solid: true, hard: 2.5, tool: "pick", tier: 1, drop: "cobble" },
    { id: 4, key: "sand", name: "Sand", color: "#e8d28a", solid: true, hard: 0.5, tool: "shovel" },
    { id: 5, key: "snow", name: "Snow", color: "#f3f8ff", solid: true, hard: 0.4, tool: "shovel" },
    { id: 6, key: "log", name: "Log", color: "#7a4f2a", solid: true, hard: 1.5, tool: "axe" },
    { id: 7, key: "leaves", name: "Leaves", color: "#2f8f3a", solid: true, hard: 0.2, drop: null },
    { id: 8, key: "planks", name: "Planks", color: "#c99a5b", solid: true, hard: 1.2, tool: "axe" },
    { id: 9, key: "cobble", name: "Cobblestone", color: "#62656e", solid: true, hard: 2.5, tool: "pick", tier: 1 },
    { id: 10, key: "coal_ore", name: "Coal ore", color: "#7d808a", spots: "#1d1d22", solid: true, hard: 3, tool: "pick", tier: 1, drop: "coal" },
    { id: 11, key: "iron_ore", name: "Iron ore", color: "#7d808a", spots: "#e0a27a", solid: true, hard: 3.5, tool: "pick", tier: 2, drop: "iron_ore" },
    { id: 12, key: "gold_ore", name: "Gold ore", color: "#7d808a", spots: "#ffd23f", solid: true, hard: 3.5, tool: "pick", tier: 3, drop: "gold_ore" },
    { id: 13, key: "gem_ore", name: "Starstone ore", color: "#5c5f6a", spots: "#5ef2ff", solid: true, hard: 4.5, tool: "pick", tier: 3, drop: "gem" },
    { id: 14, key: "water", name: "Water", color: "#2f7ff0", solid: false, liquid: true },
    { id: 15, key: "lava", name: "Lava", color: "#ff6a1a", solid: false, liquid: true, light: 6, hurts: 4 },
    { id: 16, key: "bedrock", name: "Bedrock", color: "#26262c", solid: true, hard: Infinity },
    { id: 17, key: "cactus", name: "Cactus", color: "#3c9a3a", solid: true, hard: 0.4, hurts: 1 },
    { id: 18, key: "ice", name: "Ice", color: "#a8dcff", solid: true, hard: 0.5, tool: "pick" },
    { id: 19, key: "torch", name: "Torch", color: "#ffcf3d", solid: false, hard: 0.05, light: 7 },
    { id: 20, key: "workbench", name: "Workbench", color: "#a36b34", solid: true, hard: 1.5, tool: "axe" },
    { id: 21, key: "furnace", name: "Furnace", color: "#55575f", solid: true, hard: 2.5, tool: "pick", tier: 1 },
    { id: 22, key: "glass", name: "Glass", color: "#cfefff", solid: true, hard: 0.3, drop: null },
    { id: 23, key: "bricks", name: "Stone bricks", color: "#8f929c", solid: true, hard: 2.5, tool: "pick", tier: 1 },
    { id: 24, key: "snowy_leaves", name: "Snowy leaves", color: "#d7ecef", solid: true, hard: 0.2, drop: null },
  ];
  const BLOCK = Object.fromEntries(BLOCKS.map((b) => [b.key, b]));
  const blockById = (id) => BLOCKS[id] || BLOCKS[0];

  /* ---------------------------------------------------------------- */
  /* Items (every block is also an item, by its key)                   */
  /* ---------------------------------------------------------------- */

  const TIERS = { wood: { tier: 1, speed: 2 }, stone: { tier: 2, speed: 4 }, iron: { tier: 3, speed: 6 }, gem: { tier: 4, speed: 9 } };
  const ITEMS = {
    stick: { name: "Stick", emoji: "🥢" },
    coal: { name: "Coal", emoji: "⚫" },
    iron_ore: { name: "Iron ore", emoji: "🪨" },
    gold_ore: { name: "Gold ore", emoji: "🪨" },
    iron_bar: { name: "Iron bar", emoji: "🔩" },
    gold_bar: { name: "Gold bar", emoji: "🥇" },
    gem: { name: "Starstone", emoji: "💎" },
    apple: { name: "Apple", emoji: "🍎", food: 4 },
    raw_meat: { name: "Raw meat", emoji: "🥩", food: 2 },
    cooked_meat: { name: "Cooked meat", emoji: "🍖", food: 8 },
    berries: { name: "Glowberries", emoji: "🫐", food: 3 },
    iron_armor: { name: "Iron armor", emoji: "🛡️", armor: 0.4 },
    gem_armor: { name: "Starstone armor", emoji: "🔷", armor: 0.65 },
  };
  for (const [mat, t] of Object.entries(TIERS)) {
    const label = { wood: "Wooden", stone: "Stone", iron: "Iron", gem: "Starstone" }[mat];
    ITEMS[`${mat}_pick`] = { name: `${label} pickaxe`, emoji: "⛏️", tool: "pick", ...t };
    ITEMS[`${mat}_axe`] = { name: `${label} axe`, emoji: "🪓", tool: "axe", ...t };
    ITEMS[`${mat}_shovel`] = { name: `${label} shovel`, emoji: "🥄", tool: "shovel", ...t };
    ITEMS[`${mat}_sword`] = { name: `${label} sword`, emoji: "🗡️", damage: 2 + t.tier * 2, tier: t.tier };
  }
  for (const b of BLOCKS) if (b.id && !b.liquid && b.key !== "bedrock") ITEMS[b.key] = { name: b.name, block: b.id };

  const itemName = (key) => (ITEMS[key] ? ITEMS[key].name : BLOCK[key] ? BLOCK[key].name : key);
  const STACK = 64;
  const stackSize = (key) => (ITEMS[key] && (ITEMS[key].tool || ITEMS[key].damage || ITEMS[key].armor) ? 1 : STACK);

  /* ---------------------------------------------------------------- */
  /* Crafting                                                          */
  /* ---------------------------------------------------------------- */

  /** `at`: what you must stand near (null = anywhere). */
  const RECIPES = [
    { out: "planks", n: 4, need: { log: 1 }, at: null },
    { out: "stick", n: 4, need: { planks: 2 }, at: null },
    { out: "workbench", n: 1, need: { planks: 4 }, at: null },
    { out: "torch", n: 4, need: { coal: 1, stick: 1 }, at: null },
    { out: "furnace", n: 1, need: { cobble: 8 }, at: "workbench" },
    { out: "bricks", n: 4, need: { cobble: 4 }, at: "workbench" },
    { out: "iron_bar", n: 1, need: { iron_ore: 1, coal: 1 }, at: "furnace" },
    { out: "gold_bar", n: 1, need: { gold_ore: 1, coal: 1 }, at: "furnace" },
    { out: "glass", n: 2, need: { sand: 2, coal: 1 }, at: "furnace" },
    { out: "cooked_meat", n: 1, need: { raw_meat: 1, coal: 1 }, at: "furnace" },
    { out: "iron_armor", n: 1, need: { iron_bar: 8 }, at: "workbench" },
    { out: "gem_armor", n: 1, need: { gem: 8 }, at: "workbench" },
  ];
  const MATERIAL = { wood: "planks", stone: "cobble", iron: "iron_bar", gem: "gem" };
  for (const [mat, item] of Object.entries(MATERIAL)) {
    const at = mat === "wood" ? null : "workbench";
    RECIPES.push(
      { out: `${mat}_pick`, n: 1, need: { [item]: 3, stick: 2 }, at: mat === "wood" ? "workbench" : at },
      { out: `${mat}_axe`, n: 1, need: { [item]: 3, stick: 2 }, at: "workbench" },
      { out: `${mat}_shovel`, n: 1, need: { [item]: 1, stick: 2 }, at: "workbench" },
      { out: `${mat}_sword`, n: 1, need: { [item]: 2, stick: 1 }, at: "workbench" },
    );
  }

  /* ---------------------------------------------------------------- */
  /* Inventory: 32 slots of { id, n } (the first 8 are the hotbar)     */
  /* ---------------------------------------------------------------- */

  const SLOTS = 32;
  const HOTBAR = 8;
  const emptyInventory = () => Array.from({ length: SLOTS }, () => null);

  function count(inv, key) {
    return inv.reduce((n, s) => n + (s && s.id === key ? s.n : 0), 0);
  }
  /** Add items; returns { inv, left } (left = what didn't fit). */
  function addItem(inv, key, n = 1) {
    const out = inv.map((s) => (s ? { ...s } : null));
    const max = stackSize(key);
    let left = n;
    for (const s of out) if (left && s && s.id === key && s.n < max) {
      const k = Math.min(left, max - s.n);
      s.n += k;
      left -= k;
    }
    for (let i = 0; i < out.length && left; i++) if (!out[i]) {
      const k = Math.min(left, max);
      out[i] = { id: key, n: k };
      left -= k;
    }
    return { inv: out, left };
  }
  /** Take items away (from the last slots first); null if there aren't enough. */
  function removeItem(inv, key, n = 1) {
    if (count(inv, key) < n) return null;
    const out = inv.map((s) => (s ? { ...s } : null));
    let left = n;
    for (let i = out.length - 1; i >= 0 && left; i--) {
      const s = out[i];
      if (!s || s.id !== key) continue;
      const k = Math.min(left, s.n);
      s.n -= k;
      left -= k;
      if (!s.n) out[i] = null;
    }
    return out;
  }
  /** Why a recipe can't be made right now, or null. `near` = station keys you're standing by. */
  function craftProblem(inv, recipe, near = []) {
    if (recipe.at && !near.includes(recipe.at)) return `Stand near a ${itemName(recipe.at)}`;
    for (const [k, n] of Object.entries(recipe.need)) if (count(inv, k) < n) return `Need ${n} ${itemName(k)}`;
    return null;
  }
  function craft(inv, recipe, near = []) {
    const problem = craftProblem(inv, recipe, near);
    if (problem) return { ok: false, reason: problem, inv };
    let out = inv;
    for (const [k, n] of Object.entries(recipe.need)) out = removeItem(out, k, n);
    const res = addItem(out, recipe.out, recipe.n);
    if (res.left) return { ok: false, reason: "Your bag is full", inv };
    return { ok: true, inv: res.inv };
  }

  /* ---------------------------------------------------------------- */
  /* Mining                                                            */
  /* ---------------------------------------------------------------- */

  /** Seconds to break a block with the held item (Infinity = can't). Creative is instant. */
  function mineTime(blockId, heldKey, creative = false) {
    const b = blockById(blockId);
    if (!b.solid && !b.hard) return Infinity;
    if (b.hard === Infinity) return creative ? 0.15 : Infinity;
    if (creative) return 0.15;
    const held = ITEMS[heldKey];
    let speed = 1;
    if (held && held.tool && held.tool === b.tool) speed = held.speed;
    const tier = held && held.tool === "pick" ? held.tier : 0;
    if ((b.tier || 0) > tier && b.tool === "pick") speed *= 0.3;
    return b.hard / speed;
  }
  /** What a broken block gives (null = nothing, e.g. stone by hand). */
  function dropOf(blockId, heldKey, rng = Math.random) {
    const b = blockById(blockId);
    const held = ITEMS[heldKey];
    const tier = held && held.tool === "pick" ? held.tier : 0;
    if ((b.tier || 0) > tier) return null;
    if (b.key === "leaves") return rng() < 0.08 ? "apple" : null;
    if (b.key === "snowy_leaves") return rng() < 0.08 ? "berries" : null;
    return b.drop === undefined ? b.key : b.drop;
  }

  /* ---------------------------------------------------------------- */
  /* Health, hunger, day and night                                     */
  /* ---------------------------------------------------------------- */

  const MAX_HEALTH = 20; // 10 hearts
  const MAX_HUNGER = 20;
  const DAY_SECONDS = 480; // a full day and night: 8 minutes

  /** 0–1 through the day; 0 is sunrise. */
  const dayPhase = (time) => ((time % DAY_SECONDS) + DAY_SECONDS) % DAY_SECONDS / DAY_SECONDS;
  /** Night is the last 40% of each day. */
  const isNight = (time) => dayPhase(time) >= 0.6;
  /** How bright the sky is (moonlight 0.35 at night, 1 by day), fading at sunset and sunrise. */
  const MOON = 0.35;
  function daylight(time) {
    const p = dayPhase(time);
    if (p < 0.05) return MOON + (p / 0.05) * (1 - MOON);
    if (p < 0.55) return 1;
    if (p < 0.6) return 1 - ((p - 0.55) / 0.05) * (1 - MOON);
    return MOON;
  }

  /**
   * Hunger and health over `dt` seconds. Hunger drops slowly (faster when
   * running); a full belly heals; an empty one hurts. Returns new values.
   */
  function tickBody(body, dt, moving = false) {
    const b = { ...body };
    b.hungerClock = (b.hungerClock || 0) + dt * (moving ? 1.5 : 1);
    while (b.hungerClock >= 25) {
      b.hungerClock -= 25;
      b.hunger = Math.max(0, b.hunger - 1);
    }
    b.healClock = (b.healClock || 0) + dt;
    while (b.healClock >= 3) {
      b.healClock -= 3;
      if (b.hunger >= 16 && b.health < MAX_HEALTH) b.health += 1;
      else if (b.hunger === 0) b.health = Math.max(0, b.health - 1);
    }
    return b;
  }
  function eat(body, foodKey) {
    const f = ITEMS[foodKey];
    if (!f || !f.food) return body;
    return { ...body, hunger: Math.min(MAX_HUNGER, body.hunger + f.food) };
  }
  /** Damage after armor (always at least 1). */
  function hurtBy(amount, armorKey) {
    const a = ITEMS[armorKey] ? ITEMS[armorKey].armor || 0 : 0;
    return Math.max(1, Math.round(amount * (1 - a)));
  }
  /** Falling more than 4 blocks hurts: 1 per extra block. */
  const fallDamage = (blocks) => Math.max(0, Math.floor(blocks - 4));

  /* ---------------------------------------------------------------- */
  /* Creatures (all made up)                                           */
  /* ---------------------------------------------------------------- */

  const CREATURES = {
    puffhop: { name: "Puffhop", emoji: "🐑", friendly: true, hp: 6, speed: 1.2, drop: "raw_meat", day: true },
    boinkle: { name: "Boinkle", emoji: "🐖", friendly: true, hp: 8, speed: 1, drop: "raw_meat", day: true },
    gloomer: { name: "Gloomer", emoji: "👾", hp: 10, speed: 2.2, damage: 2, drop: "coal", night: true },
    snapper: { name: "Night Snapper", emoji: "🐊", hp: 14, speed: 2.8, damage: 3, drop: "raw_meat", night: true, jumper: true },
    spookle: { name: "Spookle", emoji: "👻", hp: 8, speed: 1.6, damage: 2, drop: "berries", night: true, flies: true },
  };

  /* ---------------------------------------------------------------- */
  /* World generation                                                  */
  /* ---------------------------------------------------------------- */

  const WORLD_W = 512;
  const WORLD_H = 128;

  function seeded(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /** A number from text, so a world name/seed always makes the same world. */
  function seedFrom(text) {
    let h = 2166136261;
    for (const ch of String(text)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return h >>> 0;
  }
  function hash2(seed, x, y) {
    let h = seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  const smooth = (t) => t * t * (3 - 2 * t);
  /** Smooth 1D noise in [-1, 1]. */
  function noise1(seed, x, scale) {
    const p = x / scale;
    const i = Math.floor(p);
    const t = smooth(p - i);
    return (hash2(seed, i, 0) * (1 - t) + hash2(seed, i + 1, 0) * t) * 2 - 1;
  }
  /** Smooth 2D noise in [-1, 1]. */
  function noise2(seed, x, y, scale) {
    const px = x / scale, py = y / scale;
    const ix = Math.floor(px), iy = Math.floor(py);
    const tx = smooth(px - ix), ty = smooth(py - iy);
    const a = hash2(seed, ix, iy), b = hash2(seed, ix + 1, iy), c = hash2(seed, ix, iy + 1), d = hash2(seed, ix + 1, iy + 1);
    return ((a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty) * 2 - 1;
  }

  /** Which land a column is: "grass", "desert" or "snow". */
  function biomeAt(seed, x) {
    const n = noise1(seed + 7, x, 90) * 0.7 + noise1(seed + 8, x, 37) * 0.3;
    return n < -0.28 ? "desert" : n > 0.3 ? "snow" : "grass";
  }

  /**
   * A fresh world: { w, h, tiles (Uint8Array, row by row), spawn: { x, y } }.
   * Hills on top, dirt then stone, caves, ores deeper down (gems near the
   * bottom), water pools and lava deep, unbreakable bedrock at the bottom.
   */
  function generateWorld(seed, w = WORLD_W, h = WORLD_H) {
    const tiles = new Uint8Array(w * h);
    const set = (x, y, id) => {
      if (x >= 0 && x < w && y >= 0 && y < h) tiles[y * w + x] = id;
    };
    const get = (x, y) => (x >= 0 && x < w && y >= 0 && y < h ? tiles[y * w + x] : 16);
    const rng = seeded(seed);
    const surface = [];
    for (let x = 0; x < w; x++) {
      const hills = noise1(seed, x, 48) * 9 + noise1(seed + 1, x, 17) * 4 + noise1(seed + 2, x, 6) * 1.5;
      surface.push(Math.round(h * 0.34 + hills));
    }
    for (let x = 0; x < w; x++) {
      const biome = biomeAt(seed, x);
      const top = surface[x];
      for (let y = top; y < h; y++) {
        const depth = y - top;
        let id;
        if (y >= h - 1) id = 16;
        else if (depth === 0) id = biome === "desert" ? 4 : biome === "snow" ? 5 : 1;
        else if (depth < 4) id = biome === "desert" ? 4 : 2;
        else id = 3;
        // Caves: winding holes in the stone.
        if (id === 3 && depth > 6 && y < h - 2) {
          const c = noise2(seed + 3, x, y * 1.6, 14) + noise2(seed + 4, x, y, 6) * 0.35;
          if (c > 0.42) id = y > h * 0.82 && hash2(seed + 9, x >> 3, y >> 3) < 0.35 ? 15 : y > h * 0.55 && hash2(seed + 10, x >> 4, y >> 4) < 0.18 ? 14 : 0;
        }
        // Ores, rarer and better further down.
        if (id === 3) {
          const r = hash2(seed + 5, x, y);
          const d = y / h;
          if (r < 0.022) id = 10;
          else if (r < 0.034 && d > 0.45) id = 11;
          else if (r < 0.041 && d > 0.65) id = 12;
          else if (r < 0.045 && d > 0.8) id = 13;
        }
        set(x, y, id);
      }
      // Frozen ponds on snowy land.
      if (biome === "snow" && hash2(seed + 11, x >> 2, 0) < 0.08) set(x, top, 18);
    }
    // Ore clumps: grow each ore into a little vein.
    for (let i = 0; i < w * h * 0.004; i++) {
      const x = Math.floor(rng() * w), y = Math.floor(rng() * h);
      const id = get(x, y);
      if (id >= 10 && id <= 13) for (let k = 0; k < 3; k++) {
        const nx = x + Math.floor(rng() * 3) - 1, ny = y + Math.floor(rng() * 3) - 1;
        if (get(nx, ny) === 3) set(nx, ny, id);
      }
    }
    // Trees and cactus.
    for (let x = 3; x < w - 3; x++) {
      const biome = biomeAt(seed, x);
      const top = surface[x];
      const ground = get(x, top);
      if (ground === 0 || ground === 18) continue;
      const r = hash2(seed + 6, x, 0);
      if (biome === "desert" && r < 0.06) {
        const tall = 2 + Math.floor(r * 40) % 2;
        for (let k = 1; k <= tall; k++) set(x, top - k, 17);
        x += 2;
      } else if (biome !== "desert" && r < 0.11) {
        const trunk = 4 + Math.floor(hash2(seed + 12, x, 1) * 3);
        for (let k = 1; k <= trunk; k++) set(x, top - k, 6);
        const leaf = biome === "snow" ? 24 : 7;
        const cy = top - trunk;
        for (let dy = -2; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) {
          if (Math.abs(dx) + Math.abs(dy) > 3) continue;
          if (get(x + dx, cy + dy) === 0) set(x + dx, cy + dy, leaf);
        }
        x += 4;
      }
    }
    const sx = Math.floor(w / 2);
    let sy = 0;
    while (sy < h - 1 && !blockById(get(sx, sy)).solid) sy++;
    // Clear a spot to stand in, in case a tree is there.
    for (let k = 1; k <= 3; k++) if (blockById(get(sx, sy - k)).solid) set(sx, sy - k, 0);
    return { w, h, tiles, spawn: { x: sx + 0.5, y: sy } };
  }

  /* ---------------------------------------------------------------- */
  /* Saving worlds (compressed: run-length + base64)                   */
  /* ---------------------------------------------------------------- */

  const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  function toBase64(bytes) {
    let out = "";
    for (let i = 0; i < bytes.length; i += 3) {
      const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
      out += B64[a >> 2] + B64[((a & 3) << 4) | ((b ?? 0) >> 4)] + (b === undefined ? "=" : B64[((b & 15) << 2) | ((c ?? 0) >> 6)]) + (c === undefined ? "=" : B64[c & 63]);
    }
    return out;
  }
  function fromBase64(text) {
    const clean = text.replace(/=+$/, "");
    const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
    let o = 0;
    for (let i = 0; i < clean.length; i += 4) {
      const n = [0, 1, 2, 3].map((k) => (i + k < clean.length ? B64.indexOf(clean[i + k]) : 0));
      out[o++] = (n[0] << 2) | (n[1] >> 4);
      if (i + 2 < clean.length) out[o++] = ((n[1] & 15) << 4) | (n[2] >> 2);
      if (i + 3 < clean.length) out[o++] = ((n[2] & 3) << 6) | n[3];
    }
    return out.subarray(0, o);
  }
  /** Tiles → short text: (block, run length up to 255) pairs, base64. */
  function packTiles(tiles) {
    const pairs = [];
    for (let i = 0; i < tiles.length; ) {
      const v = tiles[i];
      let run = 1;
      while (run < 255 && i + run < tiles.length && tiles[i + run] === v) run++;
      pairs.push(v, run);
      i += run;
    }
    return toBase64(Uint8Array.from(pairs));
  }
  function unpackTiles(text, size) {
    const bytes = fromBase64(text);
    const tiles = new Uint8Array(size);
    let o = 0;
    for (let i = 0; i + 1 < bytes.length && o < size; i += 2) for (let k = 0; k < bytes[i + 1] && o < size; k++) tiles[o++] = bytes[i];
    if (o !== size) throw new Error("Broken world save");
    return tiles;
  }

  /** Everything about a world worth saving, as plain JSON-able data. */
  function saveWorld(world) {
    return {
      v: 1,
      id: world.id,
      name: world.name,
      mode: world.mode,
      seed: world.seed,
      w: world.w,
      h: world.h,
      tiles: packTiles(world.tiles),
      spawn: world.spawn,
      player: world.player,
      inventory: world.inventory,
      time: world.time,
      created: world.created,
      played: world.played,
    };
  }
  function loadWorld(data) {
    if (!data || data.v !== 1 || !data.tiles) throw new Error("Not a world save");
    return { ...data, tiles: unpackTiles(data.tiles, data.w * data.h) };
  }

  /** A brand-new world ready to play. */
  function newWorld({ id, name, mode, seedText }, now = Date.now()) {
    const seed = seedFrom(seedText || `${name}-${now}`);
    const g = generateWorld(seed);
    let inventory = emptyInventory();
    if (mode === "survival") inventory = addItem(inventory, "apple", 3).inv;
    return {
      id,
      name: String(name || "My world").slice(0, 40),
      mode: mode === "creative" ? "creative" : "survival",
      seed,
      w: g.w,
      h: g.h,
      tiles: g.tiles,
      spawn: g.spawn,
      player: { x: g.spawn.x, y: g.spawn.y, health: MAX_HEALTH, hunger: MAX_HUNGER, armor: null, selected: 0 },
      inventory,
      time: DAY_SECONDS * 0.05,
      created: now,
      played: now,
    };
  }

  /** Creative mode's block picker: every placeable block. */
  const CREATIVE_BLOCKS = BLOCKS.filter((b) => b.id && !b.liquid && b.key !== "bedrock").map((b) => b.key).concat(["water", "lava"]);

  root.TheGame = {
    BLOCKS,
    BLOCK,
    ITEMS,
    RECIPES,
    CREATURES,
    SLOTS,
    HOTBAR,
    STACK,
    MAX_HEALTH,
    MAX_HUNGER,
    DAY_SECONDS,
    WORLD_W,
    WORLD_H,
    CREATIVE_BLOCKS,
    blockById,
    itemName,
    stackSize,
    emptyInventory,
    count,
    addItem,
    removeItem,
    craftProblem,
    craft,
    mineTime,
    dropOf,
    dayPhase,
    isNight,
    daylight,
    tickBody,
    eat,
    hurtBy,
    fallDamage,
    seeded,
    seedFrom,
    biomeAt,
    generateWorld,
    packTiles,
    unpackTiles,
    saveWorld,
    loadWorld,
    newWorld,
  };
  if (typeof module !== "undefined") module.exports = root.TheGame;
})(typeof window !== "undefined" ? window : globalThis);
