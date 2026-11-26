/* Space Lane Shooter: game rules (no page code), by Logan.
 *
 * An animal pilot flies a ship along 5 lanes, blasting silly space-animal
 * enemies and a boss every 5 levels. Star coins from each run buy upgrades
 * and new pilots. Everything here is pure; game.js runs the action.
 * Loaded in the page as window.SpaceLanes, and by the tests via module.exports.
 */
(function (root) {
  const LANES = 5;
  const BOSS_EVERY = 5;
  const HIGH_SCORES = 5;

  /* ---------------------------------------------------------------- */
  /* Pilots (each has one special power)                               */
  /* ---------------------------------------------------------------- */

  const PILOTS = [
    { id: "cat", name: "Captain Cat", emoji: "🐱", price: 0, power: "Nine lives: starts with 1 extra heart", perk: { hearts: 1 } },
    { id: "dog", name: "Rocket Dog", emoji: "🐶", price: 300, power: "Rapid fire: shoots 25% faster", perk: { fireRate: 1.25 } },
    { id: "panda", name: "Panda Tank", emoji: "🐼", price: 600, power: "Bamboo armor: shields last twice as long", perk: { shieldTime: 2 } },
    { id: "fox", name: "Foxy Ace", emoji: "🦊", price: 1000, power: "Treasure hunter: double star coins", perk: { coins: 2 } },
    { id: "owl", name: "Night Owl", emoji: "🦉", price: 1800, power: "Sharp eyes: shots go through enemies", perk: { pierce: true } },
    { id: "bunny", name: "Bunny Blaster", emoji: "🐰", price: 3000, power: "Lucky: power-ups drop twice as often and last longer", perk: { dropRate: 2, powerTime: 1.5 } },
  ];

  /* ---------------------------------------------------------------- */
  /* Upgrades (5 levels each)                                          */
  /* ---------------------------------------------------------------- */

  const UPGRADES = [
    { id: "damage", name: "Blaster power", emoji: "💥", costs: [100, 250, 500, 900, 1500] },
    { id: "fireRate", name: "Fire rate", emoji: "⚡", costs: [100, 250, 500, 900, 1500] },
    { id: "armor", name: "Armor (+1 heart)", emoji: "🛡️", costs: [200, 500, 1000] },
    { id: "powerTime", name: "Power-up time", emoji: "⏳", costs: [150, 350, 700] },
  ];

  /* ---------------------------------------------------------------- */
  /* Enemies and bosses (space animals!)                               */
  /* ---------------------------------------------------------------- */

  /** `speed` px/s down the screen; `shoots` drops bullets; `points` and `coins` when destroyed. */
  const ENEMIES = [
    { id: "bee", name: "Alien Bee", emoji: "🐝", hp: 1, speed: 150, points: 10, coins: 1, from: 1 },
    { id: "shark", name: "Laser Shark", emoji: "🦈", hp: 2, speed: 95, points: 25, coins: 2, shoots: true, from: 2 },
    { id: "chicken", name: "Robo-Chicken", emoji: "🐔", hp: 3, speed: 80, points: 35, coins: 3, shoots: true, from: 3 },
    { id: "slug", name: "Space Slug", emoji: "🐌", hp: 6, speed: 55, points: 50, coins: 5, from: 4 },
  ];
  const BOSSES = [
    { id: "queenbee", name: "Queen Bee", emoji: "🐝", crown: true, hp: 40 },
    { id: "megashark", name: "Mega Shark", emoji: "🦈", crown: false, hp: 60 },
    { id: "rooster", name: "Robo-Rooster", emoji: "🐓", crown: false, hp: 80 },
    { id: "whale", name: "Cosmic Whale", emoji: "🐋", crown: false, hp: 110 },
  ];

  const POWERUPS = [
    { id: "triple", name: "Triple shot", emoji: "🔱", weight: 3 },
    { id: "shield", name: "Shield", emoji: "🫧", weight: 3 },
    { id: "laser", name: "Laser", emoji: "🔆", weight: 2 },
    { id: "bomb", name: "Bomb", emoji: "💣", weight: 1 },
    { id: "heart", name: "Extra heart", emoji: "❤️", weight: 1 },
  ];
  const BASE_DROP = 0.1;
  const BASE_POWER_SECONDS = 8;

  /* ---------------------------------------------------------------- */
  /* Random numbers (seeded, for tests)                                */
  /* ---------------------------------------------------------------- */

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

  /* ---------------------------------------------------------------- */
  /* Saving                                                            */
  /* ---------------------------------------------------------------- */

  function newState() {
    return {
      v: 1,
      coins: 0,
      pilots: ["cat"],
      pilot: "cat",
      upgrades: { damage: 0, fireRate: 0, armor: 0, powerTime: 0 },
      /** Top runs, best first: { score, level, pilot, at }. */
      scores: [],
      bestLevel: 0,
      runs: 0,
    };
  }

  function loadState(json) {
    try {
      const s = JSON.parse(json);
      if (!s || s.v !== 1 || typeof s.coins !== "number" || !Array.isArray(s.pilots)) return newState();
      const fresh = newState();
      return { ...fresh, ...s, pilots: [...s.pilots], upgrades: { ...fresh.upgrades, ...s.upgrades }, scores: [...(s.scores || [])] };
    } catch {
      return newState();
    }
  }

  const clone = (s) => ({ ...s, pilots: [...s.pilots], upgrades: { ...s.upgrades }, scores: [...s.scores] });
  const pilotById = (id) => PILOTS.find((p) => p.id === id) || PILOTS[0];

  /* ---------------------------------------------------------------- */
  /* Shop                                                              */
  /* ---------------------------------------------------------------- */

  /** Buy a pilot (used right away) or switch to one you already have. */
  function choosePilot(state, id) {
    const p = PILOTS.find((x) => x.id === id);
    if (!p) return { ok: false, reason: "No such pilot", state };
    const s = clone(state);
    if (!s.pilots.includes(id)) {
      if (s.coins < p.price) return { ok: false, reason: "Not enough star coins", state };
      s.coins -= p.price;
      s.pilots.push(id);
    }
    s.pilot = id;
    return { ok: true, state: s };
  }

  /** Price of the next level of an upgrade, or null when it's maxed. */
  function upgradeCost(state, id) {
    const u = UPGRADES.find((x) => x.id === id);
    if (!u) return null;
    const lvl = state.upgrades[id] || 0;
    return lvl < u.costs.length ? u.costs[lvl] : null;
  }

  function buyUpgrade(state, id) {
    const cost = upgradeCost(state, id);
    if (cost === null) return { ok: false, reason: "Already maxed out!", state };
    if (state.coins < cost) return { ok: false, reason: "Not enough star coins", state };
    const s = clone(state);
    s.coins -= cost;
    s.upgrades[id] = (s.upgrades[id] || 0) + 1;
    return { ok: true, state: s };
  }

  /** Everything the ship can do this run: upgrades plus the pilot's power. */
  function shipStats(state) {
    const u = state.upgrades;
    const perk = pilotById(state.pilot).perk;
    return {
      damage: 1 + u.damage * 0.5,
      shotsPerSecond: (2.5 + u.fireRate * 0.5) * (perk.fireRate || 1),
      hearts: 3 + u.armor + (perk.hearts || 0),
      powerSeconds: BASE_POWER_SECONDS * (1 + u.powerTime * 0.25) * (perk.powerTime || 1),
      shieldSeconds: BASE_POWER_SECONDS * (1 + u.powerTime * 0.25) * (perk.powerTime || 1) * (perk.shieldTime || 1),
      coinMult: perk.coins || 1,
      pierce: !!perk.pierce,
      dropChance: Math.min(0.5, BASE_DROP * (perk.dropRate || 1)),
    };
  }

  /* ---------------------------------------------------------------- */
  /* Levels                                                            */
  /* ---------------------------------------------------------------- */

  const isBossLevel = (level) => level % BOSS_EVERY === 0;
  /** Which boss (they take turns), and how tough it is at this level. */
  function bossFor(level) {
    const round = level / BOSS_EVERY - 1;
    const b = BOSSES[round % BOSSES.length];
    const hp = Math.round(b.hp * (1 + Math.floor(round / BOSSES.length) * 0.8) * (1 + round * 0.15));
    return { ...b, hp, points: 200 * (round + 1), coins: 25 * (round + 1) };
  }

  /** An enemy's toughness and speed at a level (they get a bit tougher). */
  function enemyAt(type, level) {
    const e = ENEMIES.find((x) => x.id === type);
    const tough = 1 + Math.floor((level - 1) / 5) * 0.5;
    return { ...e, hp: Math.ceil(e.hp * tough), speed: e.speed * (1 + Math.min(0.6, (level - 1) * 0.03)) };
  }

  /**
   * The enemies of a normal level: [{ at (seconds), lane, type }], getting
   * longer and busier each level. Never two at once in the same lane.
   */
  function levelPlan(level, rng = Math.random) {
    const kinds = ENEMIES.filter((e) => e.from <= level);
    const count = 8 + level * 3;
    const gap = Math.max(0.35, 1.1 - level * 0.05);
    const plan = [];
    let t = 1;
    let lastLane = -1;
    for (let i = 0; i < count; i++) {
      let lane = Math.floor(rng() * LANES);
      if (lane === lastLane) lane = (lane + 1 + Math.floor(rng() * (LANES - 1))) % LANES;
      lastLane = lane;
      // Tougher kinds show up more as levels go on.
      const k = kinds[Math.min(kinds.length - 1, Math.floor(Math.pow(rng(), 1.6 - Math.min(0.9, level * 0.05)) * kinds.length))];
      plan.push({ at: Math.round(t * 100) / 100, lane, type: k.id });
      t += gap * (0.6 + rng() * 0.8);
    }
    return plan;
  }

  function pickPowerup(rng = Math.random) {
    let r = rng() * POWERUPS.reduce((n, p) => n + p.weight, 0);
    for (const p of POWERUPS) if ((r -= p.weight) <= 0) return p.id;
    return POWERUPS[0].id;
  }

  /* ---------------------------------------------------------------- */
  /* After a run                                                       */
  /* ---------------------------------------------------------------- */

  /** Bank the run's star coins and record the score. `rank` is 1–5 if it made the board. */
  function finishRun(state, { score, level, coins }, now = Date.now()) {
    const s = clone(state);
    s.coins += Math.max(0, Math.round(coins));
    s.runs += 1;
    s.bestLevel = Math.max(s.bestLevel, level);
    const entry = { score: Math.round(score), level, pilot: s.pilot, at: now };
    s.scores = [...s.scores, entry].sort((a, b) => b.score - a.score || a.at - b.at).slice(0, HIGH_SCORES);
    const i = s.scores.indexOf(entry);
    return { state: s, rank: i >= 0 ? i + 1 : null, best: i === 0 };
  }

  /** 950 → "950", 12500 → "12.5K". */
  function short(n) {
    for (const [size, unit] of [
      [1e9, "B"],
      [1e6, "M"],
      [1e3, "K"],
    ]) {
      if (Math.abs(n) >= size) {
        const v = n / size;
        return `${v >= 100 ? Math.floor(v) : Math.floor(v * 10) / 10}${unit}`;
      }
    }
    return String(Math.floor(n));
  }

  root.SpaceLanes = {
    LANES,
    BOSS_EVERY,
    HIGH_SCORES,
    PILOTS,
    UPGRADES,
    ENEMIES,
    BOSSES,
    POWERUPS,
    seeded,
    newState,
    loadState,
    pilotById,
    choosePilot,
    upgradeCost,
    buyUpgrade,
    shipStats,
    isBossLevel,
    bossFor,
    enemyAt,
    levelPlan,
    pickPowerup,
    finishRun,
    short,
  };
  if (typeof module !== "undefined") module.exports = root.SpaceLanes;
})(typeof window !== "undefined" ? window : globalThis);
