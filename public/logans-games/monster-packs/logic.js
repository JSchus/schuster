/* Monster Packs: game rules (no page code), by Logan.
 *
 * Everything here is pure: the 200 cards, pack odds, coins, the daily
 * pack, selling, battles and saving. game.js draws the screens. Loaded in
 * the page as window.MonsterPacks, and by the tests via module.exports.
 */
(function (root) {
  /* ---------------------------------------------------------------- */
  /* Tiers, prices and types (Logan's rules)                           */
  /* ---------------------------------------------------------------- */

  /**
   * `sell` is what an extra copy is worth. It's set so that, on average,
   * selling a whole pack gives back well under its price (Basic ~74%, top
   * packs ~30%): buying and selling can't make coins out of nothing.
   */
  const TIERS = [
    { id: "basic", name: "Basic", count: 60, price: 50, sell: 4, power: [20, 40] },
    { id: "rare", name: "Rare", count: 45, price: 75, sell: 7, power: [35, 55] },
    { id: "epic", name: "Epic", count: 35, price: 100, sell: 10, power: [50, 70] },
    { id: "legendary", name: "Legendary", count: 25, price: 150, sell: 16, power: [65, 85] },
    { id: "mythical", name: "Mythical", count: 15, price: 300, sell: 35, power: [80, 100] },
    { id: "god", name: "God", count: 10, price: 1000, sell: 120, power: [95, 120] },
    { id: "original", name: "Original", count: 6, price: 2500, sell: 300, power: [115, 140] },
    { id: "goated", name: "Goated", count: 4, price: 5000, sell: 700, power: [135, 170] },
  ];
  const TOTAL_CARDS = 200;
  const PACK_SIZE = 5;
  const SHINY_CHANCE = 1 / 40;
  const SHINY_SELL_MULTIPLIER = 3;
  const START_COINS = 200;
  const COMPLETE_REWARD = 1e12; // 1 trillion coins for collecting every card
  /** How likely each tier is in an ordinary slot of a Basic pack. */
  const BASE_WEIGHTS = [64, 22, 9, 3.2, 1.2, 0.45, 0.12, 0.03];

  const TYPES = ["fire", "water", "leaf", "storm", "frost", "shadow"];
  const TYPE_NAMES = { fire: "Fire", water: "Water", leaf: "Leaf", storm: "Storm", frost: "Frost", shadow: "Shadow" };
  /** Which types each type hits hard (Fire > Leaf > Water > Fire, Storm > Water, Frost > Leaf, Fire melts Frost). */
  const BEATS = { fire: ["leaf", "frost"], water: ["fire"], leaf: ["water"], storm: ["water"], frost: ["leaf"], shadow: [] };
  const STRONG = 1.5;
  const WEAK = 0.67;

  /* ---------------------------------------------------------------- */
  /* Random numbers                                                     */
  /* ---------------------------------------------------------------- */

  /** Small seeded random generator (same seed → same numbers), for the fixed card list and tests. */
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
  const pick = (rng, list) => list[Math.floor(rng() * list.length)];
  const between = (rng, lo, hi) => Math.round(lo + rng() * (hi - lo));

  /* ---------------------------------------------------------------- */
  /* The 200 cards (always the same list)                              */
  /* ---------------------------------------------------------------- */

  const STARTS = {
    fire: ["Ember", "Blaze", "Cinder", "Scorch", "Pyro", "Flare", "Magma", "Ash", "Inferno", "Sizzle", "Kindle", "Volc"],
    water: ["Tide", "Ripple", "Aqua", "Coral", "Splash", "Torrent", "Brine", "Drizzle", "Marina", "Wave", "Abyss", "Hydro"],
    leaf: ["Moss", "Thorn", "Fern", "Bramble", "Sprout", "Vine", "Petal", "Grove", "Bark", "Clover", "Willow", "Sap"],
    storm: ["Volt", "Thunder", "Zap", "Static", "Gale", "Spark", "Bolt", "Cyclo", "Tempest", "Jolt", "Surge", "Nimbus"],
    frost: ["Frost", "Glacier", "Icicle", "Blizz", "Snow", "Rime", "Chill", "Crystal", "Polar", "Sleet", "Hail", "Tundra"],
    shadow: ["Shade", "Gloom", "Umbra", "Night", "Phantom", "Dusk", "Hex", "Murk", "Eclipse", "Wraith", "Void", "Raven"],
  };
  const ENDS = ["pup", "fang", "wing", "horn", "maw", "claw", "tail", "drake", "beast", "fin", "tusk", "shell", "back", "snout", "paw", "ling", "zor", "rex", "on", "ix"];
  const TIER_TITLES = ["", "", "", "", "Elder ", "Ancient ", "Prime ", "King "];
  const DESCRIPTIONS = {
    fire: ["Its breath can toast marshmallows from a mile away.", "Leaves glowing footprints wherever it walks.", "Sneezes sparks when it gets excited."],
    water: ["Sings to whales on quiet nights.", "Can hold its breath for a whole week.", "Makes tiny rainbows with its tail."],
    leaf: ["Takes naps in sunbeams to grow stronger.", "Flowers bloom wherever it dances.", "Hides in bushes and giggles."],
    storm: ["Its fur stands up before every storm.", "Can charge a phone with one high-five.", "Runs faster than lightning (almost)."],
    frost: ["Makes snow days happen on purpose.", "Its hugs are very, very cold.", "Skates on frozen lakes all winter."],
    shadow: ["Only seen at the corner of your eye.", "Steals socks, but returns them.", "Its eyes glow in the dark like stars."],
  };

  function buildCards() {
    const rng = seeded(20261108);
    const cards = [];
    const used = new Set();
    let id = 1;
    TIERS.forEach((tier, tierIndex) => {
      for (let i = 0; i < tier.count; i++) {
        const type = TYPES[(id * 7 + tierIndex) % TYPES.length];
        let name = "";
        for (let tries = 0; !name || used.has(name); tries++) {
          name = TIER_TITLES[tierIndex] + pick(rng, STARTS[type]) + pick(rng, ENDS);
          if (tries > 50) name += ` ${tries}`;
        }
        used.add(name);
        const power = between(rng, tier.power[0], tier.power[1]);
        cards.push({
          id,
          name,
          type,
          tier: tierIndex,
          power,
          hp: Math.round(power * (2.4 + rng() * 0.8)),
          desc: pick(rng, DESCRIPTIONS[type]),
          // Shape choices for the drawing in game.js.
          art: {
            body: Math.floor(rng() * 4),
            eyes: 1 + Math.floor(rng() * 3),
            horns: Math.floor(rng() * 3),
            wings: rng() < 0.25 + tierIndex * 0.08,
            spikes: rng() < 0.4,
            hue: Math.floor(rng() * 30) - 15,
            size: 0.85 + rng() * 0.3,
          },
        });
        id++;
      }
    });
    return cards;
  }
  const CARDS = buildCards();
  const CARD_BY_ID = new Map(CARDS.map((c) => [c.id, c]));
  const CARDS_BY_TIER = TIERS.map((_, t) => CARDS.filter((c) => c.tier === t));

  /* ---------------------------------------------------------------- */
  /* Saving                                                             */
  /* ---------------------------------------------------------------- */

  function newState() {
    return { v: 1, coins: START_COINS, owned: {}, shiny: {}, lastDaily: null, rewardClaimed: false, packsOpened: 0, battlesWon: 0 };
  }

  /** Read a saved game; anything broken or unknown starts fresh. */
  function loadState(json) {
    try {
      const s = JSON.parse(json);
      if (!s || s.v !== 1 || typeof s.coins !== "number" || typeof s.owned !== "object") return newState();
      return { ...newState(), ...s, owned: { ...s.owned }, shiny: { ...(s.shiny || {}) } };
    } catch {
      return newState();
    }
  }

  const clone = (s) => ({ ...s, owned: { ...s.owned }, shiny: { ...s.shiny } });

  /* ---------------------------------------------------------------- */
  /* Packs                                                              */
  /* ---------------------------------------------------------------- */

  function weightedTier(rng, weights, minTier) {
    let total = 0;
    for (let t = minTier; t < weights.length; t++) total += weights[t];
    let r = rng() * total;
    for (let t = minTier; t < weights.length; t++) {
      r -= weights[t];
      if (r <= 0) return t;
    }
    return weights.length - 1;
  }

  /**
   * The tiers of the 5 cards in a pack: one card is the pack's tier or
   * better, and the rest can't be more than two tiers below the pack.
   */
  function rollPackTiers(packTier, rng) {
    const tiers = [weightedTier(rng, BASE_WEIGHTS, packTier)];
    const floor = Math.max(0, packTier - 2);
    while (tiers.length < PACK_SIZE) tiers.push(weightedTier(rng, BASE_WEIGHTS, floor));
    // Show the best card last.
    return tiers.sort((a, b) => a - b);
  }

  /**
   * Open a pack. Pays its price unless `free`. Returns the new state, the
   * cards (with isNew and shiny), and whether this pack completed the index.
   */
  function openPack(state, packTier, rng = Math.random, opts = {}) {
    const price = TIERS[packTier].price;
    if (!opts.free && state.coins < price) return { ok: false, reason: "Not enough coins", state };
    const s = clone(state);
    if (!opts.free) s.coins -= price;
    const cards = rollPackTiers(packTier, rng).map((t) => {
      const card = pick(rng, CARDS_BY_TIER[t]);
      const shiny = rng() < SHINY_CHANCE;
      const isNew = !s.owned[card.id] && !s.shiny[card.id];
      if (shiny) s.shiny[card.id] = (s.shiny[card.id] || 0) + 1;
      else s.owned[card.id] = (s.owned[card.id] || 0) + 1;
      return { id: card.id, shiny, isNew };
    });
    s.packsOpened += 1;
    const completed = collectedCount(s) === TOTAL_CARDS && !s.rewardClaimed;
    if (completed) {
      s.rewardClaimed = true;
      s.coins += COMPLETE_REWARD;
    }
    return { ok: true, state: s, cards, completed };
  }

  /** How many of the 200 different cards you have (normal or shiny). */
  function collectedCount(state) {
    let n = 0;
    for (const c of CARDS) if (state.owned[c.id] || state.shiny[c.id]) n++;
    return n;
  }

  /* ---------------------------------------------------------------- */
  /* Daily free pack                                                    */
  /* ---------------------------------------------------------------- */

  /** "2026-11-08" in the device's own time zone. */
  function localDay(now) {
    const d = new Date(now);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function canClaimDaily(state, now = Date.now()) {
    return state.lastDaily !== localDay(now);
  }
  /** Open the free Basic pack (once per day). */
  function claimDaily(state, rng = Math.random, now = Date.now()) {
    if (!canClaimDaily(state, now)) return { ok: false, reason: "Come back tomorrow", state };
    const res = openPack(state, 0, rng, { free: true });
    res.state.lastDaily = localDay(now);
    return res;
  }
  function msUntilMidnight(now = Date.now()) {
    const d = new Date(now);
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    return next.getTime() - d.getTime();
  }

  /* ---------------------------------------------------------------- */
  /* Selling extras                                                     */
  /* ---------------------------------------------------------------- */

  function sellValue(cardId, shiny) {
    const c = CARD_BY_ID.get(cardId);
    return c ? TIERS[c.tier].sell * (shiny ? SHINY_SELL_MULTIPLIER : 1) : 0;
  }

  /** Sell one copy, but never your last one of that card. */
  function sellOne(state, cardId, shiny) {
    const bag = shiny ? state.shiny : state.owned;
    if ((bag[cardId] || 0) < 2) return { ok: false, reason: "That's your only one", state };
    const s = clone(state);
    (shiny ? s.shiny : s.owned)[cardId] -= 1;
    s.coins += sellValue(cardId, shiny);
    return { ok: true, state: s };
  }

  /** Every copy beyond the first (normal and shiny kept separately). */
  function extras(state) {
    const list = [];
    for (const [bag, shiny] of [[state.owned, false], [state.shiny, true]]) {
      for (const [id, n] of Object.entries(bag)) if (n > 1) list.push({ id: Number(id), shiny, copies: n - 1 });
    }
    return list;
  }
  function extrasValue(state) {
    return extras(state).reduce((sum, e) => sum + sellValue(e.id, e.shiny) * e.copies, 0);
  }
  function sellAllExtras(state) {
    const s = clone(state);
    let earned = 0;
    for (const e of extras(state)) {
      (e.shiny ? s.shiny : s.owned)[e.id] = 1;
      earned += sellValue(e.id, e.shiny) * e.copies;
    }
    s.coins += earned;
    return { state: s, earned };
  }

  /* ---------------------------------------------------------------- */
  /* Battles                                                            */
  /* ---------------------------------------------------------------- */

  const DIFFICULTIES = [
    { id: "easy", name: "Easy", shift: -1, reward: 40 },
    { id: "medium", name: "Medium", shift: 0, reward: 100 },
    { id: "hard", name: "Hard", shift: 1, reward: 250 },
  ];

  function typeMultiplier(attacker, defender) {
    if (BEATS[attacker].includes(defender)) return STRONG;
    if (BEATS[defender].includes(attacker)) return WEAK;
    return 1;
  }

  /** One hit: power × type × a little luck (85%–115%). */
  function damage(attacker, defender, rng = Math.random) {
    return Math.max(1, Math.round(attacker.power * typeMultiplier(attacker.type, defender.type) * (0.85 + rng() * 0.3)));
  }

  /** The computer's team of 3, a little weaker or stronger than yours. */
  function cpuTeam(playerIds, difficulty, rng = Math.random) {
    const avg = playerIds.reduce((s, id) => s + CARD_BY_ID.get(id).tier, 0) / playerIds.length;
    const tier = Math.min(TIERS.length - 1, Math.max(0, Math.round(avg) + DIFFICULTIES[difficulty].shift));
    const pool = CARDS_BY_TIER[tier];
    const team = [];
    while (team.length < 3) {
      const c = pick(rng, pool);
      if (!team.includes(c.id) || pool.length < 3) team.push(c.id);
    }
    return team;
  }

  /** Two cards trade hits (you first) until one faints. Returns every hit, for the animation. */
  function duel(playerId, cpuId, rng = Math.random) {
    const a = CARD_BY_ID.get(playerId);
    const b = CARD_BY_ID.get(cpuId);
    let hpA = a.hp;
    let hpB = b.hp;
    const hits = [];
    for (let turn = 0; hpA > 0 && hpB > 0 && turn < 200; turn++) {
      const playerTurn = turn % 2 === 0;
      const dmg = playerTurn ? damage(a, b, rng) : damage(b, a, rng);
      if (playerTurn) hpB = Math.max(0, hpB - dmg);
      else hpA = Math.max(0, hpA - dmg);
      hits.push({ by: playerTurn ? "player" : "cpu", dmg, hpA, hpB });
    }
    return { winner: hpB <= 0 ? "player" : "cpu", hits, maxA: a.hp, maxB: b.hp };
  }

  /** Coins for winning a battle: more for harder levels and stronger teams. */
  function battleReward(playerIds, difficulty) {
    const avg = playerIds.reduce((s, id) => s + CARD_BY_ID.get(id).tier, 0) / playerIds.length;
    return Math.round(DIFFICULTIES[difficulty].reward * (1 + avg));
  }

  /* ---------------------------------------------------------------- */
  /* Showing numbers                                                    */
  /* ---------------------------------------------------------------- */

  /** 950 → "950", 12500 → "12.5K", 1e12 → "1T". */
  function formatCoins(n) {
    const units = [
      [1e12, "T"],
      [1e9, "B"],
      [1e6, "M"],
      [1e3, "K"],
    ];
    for (const [size, unit] of units) {
      if (Math.abs(n) >= size) {
        const v = n / size;
        return `${v >= 100 ? Math.floor(v) : Math.floor(v * 10) / 10}${unit}`;
      }
    }
    return String(Math.floor(n));
  }

  root.MonsterPacks = {
    TIERS,
    TYPES,
    TYPE_NAMES,
    BEATS,
    TOTAL_CARDS,
    PACK_SIZE,
    SHINY_CHANCE,
    START_COINS,
    COMPLETE_REWARD,
    DIFFICULTIES,
    CARDS,
    CARD_BY_ID,
    seeded,
    newState,
    loadState,
    openPack,
    rollPackTiers,
    collectedCount,
    localDay,
    canClaimDaily,
    claimDaily,
    msUntilMidnight,
    sellValue,
    sellOne,
    extras,
    extrasValue,
    sellAllExtras,
    typeMultiplier,
    damage,
    cpuTeam,
    duel,
    battleReward,
    formatCoins,
  };
  if (typeof module !== "undefined") module.exports = root.MonsterPacks;
})(typeof window !== "undefined" ? window : globalThis);
