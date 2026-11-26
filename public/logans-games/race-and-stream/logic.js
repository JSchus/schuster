/* Race & Stream: game rules (no page code), by Logan.
 *
 * You're a racer, a gamer and a video creator. Races, the arcade game on
 * your PC, videos and live streams all earn money and subscribers; money
 * buys faster cars and better gear; subscriber milestones unlock tracks
 * and features. Everything here is pure; game.js draws the screens.
 * Loaded in the page as window.RaceStream, and by the tests via module.exports.
 */
(function (root) {
  /* ---------------------------------------------------------------- */
  /* Things you can buy                                                 */
  /* ---------------------------------------------------------------- */

  /** `top` px/s, `accel` px/s², `turn` rad/s. */
  const CARS = [
    { id: "kart", name: "Go-Kart", emoji: "🛺", price: 0, top: 210, accel: 160, turn: 2.6, color: "#ffcf3d" },
    { id: "street", name: "Street Racer", emoji: "🚗", price: 500, top: 250, accel: 190, turn: 2.8, color: "#4fa3ff" },
    { id: "sports", name: "Sports Car", emoji: "🏎️", price: 3000, top: 295, accel: 225, turn: 3.0, color: "#ff4f6d" },
    { id: "super", name: "Super Car", emoji: "🚀", price: 15000, top: 340, accel: 260, turn: 3.2, color: "#3df2a0" },
    { id: "hyper", name: "Hyper Car", emoji: "⚡", price: 75000, top: 390, accel: 300, turn: 3.4, color: "#c27bff" },
  ];
  /** Gaming PCs multiply what the arcade game pays. */
  const PCS = [
    { id: "laptop", name: "Old Laptop", emoji: "💻", price: 0, mult: 1 },
    { id: "gaming", name: "Gaming PC", emoji: "🖥️", price: 800, mult: 1.5 },
    { id: "pro", name: "Pro Rig", emoji: "🕹️", price: 5000, mult: 2.5 },
    { id: "ultra", name: "Ultra Rig", emoji: "👾", price: 25000, mult: 4 },
  ];
  /** Cameras multiply video views. */
  const CAMERAS = [
    { id: "phone", name: "Phone Camera", emoji: "📱", price: 0, mult: 1 },
    { id: "webcam", name: "Webcam", emoji: "📷", price: 300, mult: 1.5 },
    { id: "hd", name: "HD Camera", emoji: "🎥", price: 2000, mult: 2.5 },
    { id: "studio", name: "Studio Camera", emoji: "🎬", price: 12000, mult: 4 },
  ];
  /** Microphones multiply live-stream viewers and pay. */
  const MICS = [
    { id: "headset", name: "Headset", emoji: "🎧", price: 0, mult: 1 },
    { id: "usb", name: "USB Mic", emoji: "🎙️", price: 250, mult: 1.4 },
    { id: "studio", name: "Studio Mic", emoji: "🎤", price: 3000, mult: 2 },
  ];
  const GEAR = { car: CARS, pc: PCS, camera: CAMERAS, mic: MICS };

  /* ---------------------------------------------------------------- */
  /* Tracks and milestones                                             */
  /* ---------------------------------------------------------------- */

  /** `aiTop` is how fast the computer cars go; `prize` is first place. */
  const TRACKS = [
    { id: "rookie", name: "Rookie Ring", emoji: "🌳", subs: 0, laps: 3, prize: 120, aiTop: 190 },
    { id: "desert", name: "Desert Dash", emoji: "🌵", subs: 1000, laps: 3, prize: 450, aiTop: 235 },
    { id: "city", name: "City Night", emoji: "🌃", subs: 100000, laps: 3, prize: 2500, aiTop: 285 },
    { id: "mountain", name: "Mountain Pass", emoji: "🏔️", subs: 1000000, laps: 3, prize: 10000, aiTop: 335 },
  ];
  const PLACE_SHARE = [1, 0.5, 0.25, 0.1];
  const RACERS = 4;

  const MILESTONES = [
    { subs: 1000, name: "1K subscribers", unlocks: "Live streaming and the Desert Dash track" },
    { subs: 100000, name: "100K subscribers", unlocks: "City Night track and sponsor deals (+50% video money)" },
    { subs: 1000000, name: "1M subscribers", unlocks: "Mountain Pass track and the Gold Play Button 🏆" },
  ];
  const LIVE_SUBS = 1000;
  const SPONSOR_SUBS = 100000;
  const START_MONEY = 100;

  /* ---------------------------------------------------------------- */
  /* Random numbers (seeded, for tests)                                 */
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
  /* Saving                                                             */
  /* ---------------------------------------------------------------- */

  function newState() {
    return {
      v: 1,
      money: START_MONEY,
      subs: 0,
      owned: { car: ["kart"], pc: ["laptop"], camera: ["phone"], mic: ["headset"] },
      using: { car: "kart", pc: "laptop", camera: "phone", mic: "headset" },
      /** The last race, for "Race highlight" videos. */
      clip: null,
      arcadeBest: 0,
      bestLaps: {},
      /** Newest first, at most 30. */
      videos: [],
      /** Recent video topics (newest first), so repeating one gets fewer views. */
      recentTopics: [],
      stats: { races: 0, wins: 0, arcade: 0, videos: 0, streams: 0 },
    };
  }

  function loadState(json) {
    try {
      const s = JSON.parse(json);
      if (!s || s.v !== 1 || typeof s.money !== "number" || typeof s.subs !== "number") return newState();
      const fresh = newState();
      return {
        ...fresh,
        ...s,
        owned: { ...fresh.owned, ...s.owned },
        using: { ...fresh.using, ...s.using },
        stats: { ...fresh.stats, ...s.stats },
        bestLaps: { ...s.bestLaps },
        videos: [...(s.videos || [])],
        recentTopics: [...(s.recentTopics || [])],
      };
    } catch {
      return newState();
    }
  }

  const clone = (s) => ({
    ...s,
    owned: { car: [...s.owned.car], pc: [...s.owned.pc], camera: [...s.owned.camera], mic: [...s.owned.mic] },
    using: { ...s.using },
    stats: { ...s.stats },
    bestLaps: { ...s.bestLaps },
    videos: [...s.videos],
    recentTopics: [...s.recentTopics],
  });

  const item = (kind, id) => GEAR[kind].find((g) => g.id === id) || GEAR[kind][0];
  const using = (s, kind) => item(kind, s.using[kind]);

  /** Buy something (it's used right away), or switch to one you already own. */
  function buy(state, kind, id) {
    const thing = GEAR[kind] && GEAR[kind].find((g) => g.id === id);
    if (!thing) return { ok: false, reason: "Not in the shop", state };
    const s = clone(state);
    if (!s.owned[kind].includes(id)) {
      if (s.money < thing.price) return { ok: false, reason: "Not enough money", state };
      s.money -= thing.price;
      s.owned[kind].push(id);
    }
    s.using[kind] = id;
    return { ok: true, state: s };
  }

  /* ---------------------------------------------------------------- */
  /* Subscribers and milestones                                         */
  /* ---------------------------------------------------------------- */

  const trackUnlocked = (state, track) => state.subs >= track.subs;
  const liveUnlocked = (state) => state.subs >= LIVE_SUBS;
  const sponsored = (state) => state.subs >= SPONSOR_SUBS;

  /** Milestones passed going from `before` to `after` subscribers. */
  function newMilestones(before, after) {
    return MILESTONES.filter((m) => before < m.subs && after >= m.subs);
  }
  function nextMilestone(subs) {
    return MILESTONES.find((m) => subs < m.subs) || null;
  }

  /** Add money and subscribers; returns the new state and any milestones reached. */
  function earn(state, money, subs) {
    const s = clone(state);
    s.money += Math.max(0, Math.round(money));
    s.subs += Math.max(0, Math.round(subs));
    return { state: s, milestones: newMilestones(state.subs, s.subs) };
  }

  /* ---------------------------------------------------------------- */
  /* Racing                                                             */
  /* ---------------------------------------------------------------- */

  /** Prize money and new subscribers for a finishing place (1–4) on a track. */
  function racePrize(trackIndex, place) {
    const t = TRACKS[trackIndex];
    const share = PLACE_SHARE[Math.min(Math.max(place, 1), RACERS) - 1];
    return { money: Math.round(t.prize * share), subs: Math.round(t.prize * share * 0.25 + (place === 1 ? 10 : 2)) };
  }

  /** Record a finished race: pays out, saves the clip and best lap. */
  function finishRace(state, trackIndex, place, bestLapMs) {
    const prize = racePrize(trackIndex, place);
    const res = earn(state, prize.money, prize.subs);
    const s = res.state;
    s.stats.races += 1;
    if (place === 1) s.stats.wins += 1;
    s.clip = { track: TRACKS[trackIndex].id, place };
    const id = TRACKS[trackIndex].id;
    if (bestLapMs > 0 && (!s.bestLaps[id] || bestLapMs < s.bestLaps[id])) s.bestLaps[id] = Math.round(bestLapMs);
    return { state: s, prize, milestones: res.milestones };
  }

  /* ---------------------------------------------------------------- */
  /* Arcade game on your PC                                             */
  /* ---------------------------------------------------------------- */

  function arcadePay(score, pcMult) {
    return { money: Math.round(score * 0.4 * pcMult), subs: Math.round(score * 0.05 * pcMult) };
  }
  /** Record an arcade game: pays (more with a better PC); a new high score earns bonus fans. */
  function finishArcade(state, score) {
    const pay = arcadePay(score, using(state, "pc").mult);
    const record = score > state.arcadeBest;
    if (record && state.arcadeBest > 0) pay.subs += Math.round(score * 0.1);
    const res = earn(state, pay.money, pay.subs);
    res.state.stats.arcade += 1;
    if (record) res.state.arcadeBest = score;
    return { state: res.state, pay, record, milestones: res.milestones };
  }

  /* ---------------------------------------------------------------- */
  /* Videos                                                             */
  /* ---------------------------------------------------------------- */

  const TOPICS = [
    { id: "race", name: "Race highlight", emoji: "🏎️", mult: 1.3 },
    { id: "gaming", name: "Gaming video", emoji: "🎮", mult: 1.2 },
    { id: "challenge", name: "Challenge", emoji: "🔥", mult: 1.1 },
    { id: "vlog", name: "Vlog", emoji: "📹", mult: 0.9 },
  ];
  /** Clickbait gets more views but fewer likes; honest gets more likes. */
  const TITLE_STYLES = { normal: { views: 1, likes: 1 }, clickbait: { views: 1.35, likes: 0.6 }, honest: { views: 0.9, likes: 1.4 } };
  const THUMBS = [
    { id: "bright", name: "Bright colors", emoji: "🌈", mult: 1.2 },
    { id: "face", name: "Shocked face", emoji: "😱", mult: 1.15 },
    { id: "plain", name: "Plain", emoji: "⬜", mult: 1 },
  ];

  /** Why a topic can't be used yet, or null. */
  function topicProblem(state, topicId) {
    if (topicId === "race" && !state.clip) return "Finish a race first to get a highlight.";
    if (topicId === "gaming" && !state.arcadeBest) return "Play the arcade game on your PC first.";
    return null;
  }

  /** Three titles to pick from, one per style. */
  function titlesFor(state, topicId) {
    const track = state.clip && TRACKS.find((t) => t.id === state.clip.track);
    const won = state.clip && state.clip.place === 1;
    const t = {
      race: [
        `${won ? "I WON" : "Racing"} on ${track ? track.name : "the track"}!`,
        `${won ? "1ST PLACE?!" : "YOU WON'T BELIEVE THIS RACE"} 😱🔥`,
        `${track ? track.name : "Race"}: full race, ${won ? "1st" : `${state.clip ? state.clip.place : 4}th`} place`,
      ],
      gaming: [`My arcade high score: ${state.arcadeBest}`, `IMPOSSIBLE SCORE?! (${state.arcadeBest}) 🤯`, `Playing my favorite arcade game`],
      challenge: ["Racing with my eyes half closed", "I TRIED THE HARDEST CHALLENGE EVER 😱", "A fun driving challenge"],
      vlog: ["A day in my life as a racer", "THIS HAPPENED TODAY 😳", "Garage tour and update"],
    }[topicId];
    return [
      { style: "normal", text: t[0] },
      { style: "clickbait", text: t[1] },
      { style: "honest", text: t[2] },
    ];
  }

  /**
   * Post a video. `quality` (0–1) comes from the editing game. Views grow
   * with your camera, subscribers, topic, title and thumbnail, and drop if
   * you keep making the same kind of video.
   */
  function postVideo(state, { topic, titleStyle, title, thumb, quality }, rng = Math.random) {
    const problem = topicProblem(state, topic);
    if (problem) return { ok: false, reason: problem, state };
    const tp = TOPICS.find((t) => t.id === topic);
    const ts = TITLE_STYLES[titleStyle] || TITLE_STYLES.normal;
    const th = THUMBS.find((t) => t.id === thumb) || THUMBS[2];
    const q = Math.min(1, Math.max(0, quality));
    const repeats = state.recentTopics.filter((t) => t === topic).length;
    const fresh = Math.pow(0.7, repeats);
    const winBonus = topic === "race" && state.clip && state.clip.place === 1 ? 1.25 : 1;
    const audience = 150 + state.subs * 0.3;
    const luck = 0.8 + rng() * 0.5;
    const views = Math.round(audience * using(state, "camera").mult * tp.mult * ts.views * th.mult * (0.4 + q) * fresh * winBonus * luck);
    const likes = Math.round(views * (0.03 + 0.05 * q) * ts.likes);
    const newSubs = Math.round(views * (0.02 + 0.04 * q));
    const money = Math.round(views * 0.02 * (sponsored(state) ? 1.5 : 1));
    const res = earn(state, money, newSubs);
    const s = res.state;
    s.stats.videos += 1;
    s.recentTopics = [topic, ...s.recentTopics].slice(0, 3);
    const video = { title: String(title || "").slice(0, 80), topic, views, likes, subs: newSubs, money, at: Date.now() };
    s.videos = [video, ...s.videos].slice(0, 30);
    return { ok: true, state: s, video, milestones: res.milestones };
  }

  /* ---------------------------------------------------------------- */
  /* Live streams (from 1K subscribers)                                 */
  /* ---------------------------------------------------------------- */

  /** Viewers when you go live. */
  function liveStartViewers(state) {
    return Math.max(5, Math.round((5 + state.subs * 0.01) * using(state, "mic").mult));
  }
  /**
   * End a stream. `peak` viewers, `happy` (0–1) how well you kept chat
   * happy, `tips` money from thanked donations.
   */
  function finishLive(state, { peak, happy, tips }) {
    if (!liveUnlocked(state)) return { ok: false, reason: `Live streaming unlocks at ${LIVE_SUBS.toLocaleString("en-US")} subscribers.`, state };
    const h = Math.min(1, Math.max(0, happy));
    const mic = using(state, "mic").mult;
    const money = Math.round(Math.max(0, tips) + peak * 0.5 * mic * (sponsored(state) ? 1.5 : 1));
    const subs = Math.round(peak * (0.1 + 0.4 * h));
    const res = earn(state, money, subs);
    res.state.stats.streams += 1;
    return { ok: true, state: res.state, money, subs, milestones: res.milestones };
  }

  /* ---------------------------------------------------------------- */
  /* Showing numbers                                                    */
  /* ---------------------------------------------------------------- */

  /** 950 → "950", 12500 → "12.5K", 3200000 → "3.2M". */
  function short(n) {
    for (const [size, unit] of [
      [1e12, "T"],
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
  /** 83456 → "1:23.45". */
  function lapTime(ms) {
    const m = Math.floor(ms / 60000);
    const s = (ms % 60000) / 1000;
    return `${m}:${s.toFixed(2).padStart(5, "0")}`;
  }

  root.RaceStream = {
    CARS,
    PCS,
    CAMERAS,
    MICS,
    GEAR,
    TRACKS,
    RACERS,
    MILESTONES,
    LIVE_SUBS,
    SPONSOR_SUBS,
    START_MONEY,
    TOPICS,
    TITLE_STYLES,
    THUMBS,
    seeded,
    newState,
    loadState,
    item,
    using,
    buy,
    trackUnlocked,
    liveUnlocked,
    sponsored,
    newMilestones,
    nextMilestone,
    earn,
    racePrize,
    finishRace,
    arcadePay,
    finishArcade,
    topicProblem,
    titlesFor,
    postVideo,
    liveStartViewers,
    finishLive,
    short,
    lapTime,
  };
  if (typeof module !== "undefined") module.exports = root.RaceStream;
})(typeof window !== "undefined" ? window : globalThis);
