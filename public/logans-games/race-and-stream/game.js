/* Race & Stream: screens, the race, the arcade game, videos and live streams, by Logan.
 * The rules live in logic.js. */
(function () {
  "use strict";
  const R = window.RaceStream;
  const SAVE_KEY = "logans-games:race-and-stream";
  const MUTE_KEY = "logans-games:race-and-stream:muted";
  const app = document.getElementById("app");

  /* ---------------------------------------------------------------- */
  /* State and saving (on this device)                                 */
  /* ---------------------------------------------------------------- */

  let state = R.loadState(read(SAVE_KEY));
  let muted = read(MUTE_KEY) === "1";
  let screen = "home";
  /** Stops whatever is animating on the current screen (race, arcade, stream…). */
  let stopScreen = () => {};

  function read(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  function write(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {}
  }
  function setState(next) {
    state = next;
    write(SAVE_KEY, JSON.stringify(state));
  }
  /** Save a result that may have passed milestones, and celebrate them. */
  function applyResult(res) {
    setState(res.state);
    for (const m of res.milestones || []) setTimeout(() => celebrateMilestone(m), 400);
  }

  /* ---------------------------------------------------------------- */
  /* Little helpers                                                    */
  /* ---------------------------------------------------------------- */

  function h(tag, props, ...children) {
    const [name, ...classes] = tag.split(".");
    const el = document.createElement(name || "div");
    if (classes.length) el.className = classes.join(" ");
    for (const [k, v] of Object.entries(props || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "style") el.style.cssText = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : String(c));
    return el;
  }
  const money = (n) => `$${R.short(n)}`;
  const subs = (n) => R.short(n);
  const pick = (list) => list[Math.floor(Math.random() * list.length)];

  function toast(text) {
    document.querySelector(".toast")?.remove();
    const t = h("div.toast", { role: "status" }, text);
    document.body.append(t);
    setTimeout(() => t.remove(), 2600);
  }
  function confetti(count = 40) {
    const bits = ["🎉", "✨", "💵", "⭐", "🏁", "🔥"];
    for (let i = 0; i < count; i++) {
      const c = h("div.confetti", { style: `left:${Math.random() * 100}vw;animation-duration:${2 + Math.random() * 2.5}s;animation-delay:${Math.random() * 0.6}s` }, bits[i % bits.length]);
      document.body.append(c);
      setTimeout(() => c.remove(), 5500);
    }
  }
  function overlay(label, ...children) {
    const o = h("div.overlay", { role: "dialog", "aria-label": label }, h("div.panel.dialog", {}, ...children));
    document.body.append(o);
    return o;
  }

  /* ---------------------------------------------------------------- */
  /* Sounds (made on the fly, no files)                                */
  /* ---------------------------------------------------------------- */

  let audio = null;
  function tone(freq, start, length, type = "triangle", volume = 0.1) {
    if (muted) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const t = audio.currentTime + start;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(volume, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
      osc.connect(gain).connect(audio.destination);
      osc.start(t);
      osc.stop(t + length + 0.02);
    } catch {}
  }
  const sounds = {
    beep: () => tone(440, 0, 0.15, "square", 0.07),
    go: () => tone(880, 0, 0.35, "square", 0.08),
    coin: () => { tone(988, 0, 0.08, "square", 0.05); tone(1319, 0.08, 0.2, "square", 0.05); },
    crash: () => tone(110, 0, 0.3, "sawtooth", 0.09),
    click: () => tone(660, 0, 0.06, "triangle", 0.06),
    win: () => [0, 4, 7, 12].forEach((st, i) => tone(523 * 2 ** (st / 12), i * 0.12, 0.3)),
    lose: () => [7, 4, 0].forEach((st, i) => tone(330 * 2 ** (st / 12), i * 0.15, 0.3)),
  };

  /* ---------------------------------------------------------------- */
  /* Layout                                                            */
  /* ---------------------------------------------------------------- */

  const SCREENS = [
    ["home", "🏠 Home"],
    ["race", "🏎️ Race"],
    ["gamer", "🎮 Gamer"],
    ["create", "🎥 Create"],
    ["shop", "🛒 Shop"],
  ];

  function go(to) {
    stopScreen();
    stopScreen = () => {};
    screen = to;
    render();
  }

  function render() {
    const body =
      screen === "race" ? raceScreen() : screen === "gamer" ? gamerScreen() : screen === "create" ? createScreen() : screen === "shop" ? shopScreen() : homeScreen();
    app.replaceChildren(topBar(), tabs(), h("main", {}, body), footer());
  }

  function topBar() {
    return h(
      "header.top",
      {},
      h("h1", {}, h("a", { href: "/logans-games" }, "🏁 Race & Stream")),
      h("span.pill.money", { title: `$${state.money.toLocaleString("en-US")}` }, money(state.money)),
      h("span.pill.subs", { title: `${state.subs.toLocaleString("en-US")} subscribers` }, `👥 ${subs(state.subs)}`),
      h(
        "button.icon-btn",
        {
          "aria-label": muted ? "Turn sound on" : "Turn sound off",
          onclick: () => {
            muted = !muted;
            write(MUTE_KEY, muted ? "1" : "0");
            render();
          },
        },
        muted ? "🔇" : "🔊",
      ),
    );
  }

  function tabs() {
    return h(
      "nav.tabs",
      { "aria-label": "Game" },
      SCREENS.map(([id, label]) => h("button.tab", { "aria-current": screen === id ? "page" : null, onclick: () => go(id) }, label)),
    );
  }

  function footer() {
    return h(
      "footer",
      {},
      "Made by Logan · ",
      h("a", { href: "/logans-games" }, "More games"),
      " · ",
      h(
        "a",
        {
          href: "#",
          onclick: (e) => {
            e.preventDefault();
            if (confirm("Start over? This deletes your money, subscribers and gear on this device.")) {
              setState(R.newState());
              go("home");
            }
          },
        },
        "Reset game",
      ),
    );
  }

  /* ---------------------------------------------------------------- */
  /* Home                                                              */
  /* ---------------------------------------------------------------- */

  function homeScreen() {
    const next = R.nextMilestone(state.subs);
    const prev = [...R.MILESTONES].reverse().find((m) => state.subs >= m.subs);
    const from = prev ? prev.subs : 0;
    const pct = next ? Math.min(100, ((state.subs - from) / (next.subs - from)) * 100) : 100;
    const gear = ["car", "pc", "camera", "mic"].map((k) => R.using(state, k));
    const activity = (to, emoji, title, text) => h("button.activity", { onclick: () => go(to) }, h("span.big-emoji", {}, emoji), h("strong", {}, title), h("span.muted", {}, text));
    return h(
      "section",
      {},
      h(
        "div.panel.channel",
        {},
        h("div.avatar", {}, "🏁"),
        h(
          "div",
          { style: "flex:1;min-width:0" },
          h("strong", { style: "font-size:20px" }, "Logan's Channel"),
          h("div.muted", {}, `${state.subs.toLocaleString("en-US")} subscribers · ${state.stats.videos} videos · ${state.stats.wins} race wins`),
          h("div.gear", {}, gear.map((g) => h("span", { title: g.name }, `${g.emoji} ${g.name}`))),
        ),
      ),
      h(
        "div.panel",
        {},
        next ? h("strong", {}, `Next: ${next.name}`) : h("strong", {}, "🏆 You reached every milestone. LEGEND!"),
        next ? h("div.muted", {}, `Unlocks: ${next.unlocks}`) : null,
        h("div.progress", { role: "progressbar", "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": Math.round(pct) }, h("div", { style: `width:${pct}%` })),
        next ? h("div.muted", {}, `${subs(state.subs)} / ${subs(next.subs)} subscribers`) : null,
      ),
      h(
        "div.activities",
        {},
        activity("race", "🏎️", "Race", "Win races for money, fans and video clips"),
        activity("gamer", "🎮", "Gamer", "Beat high scores on your PC"),
        activity("create", "🎥", "Create", R.liveUnlocked(state) ? "Make videos and go live" : "Make videos (live at 1K subs)"),
        activity("shop", "🛒", "Shop", "Faster cars and better gear"),
      ),
      h("h2", {}, "Milestones"),
      h(
        "ul.milestones",
        {},
        R.MILESTONES.map((m) => h(`li${state.subs >= m.subs ? ".done" : ""}`, {}, h("span", {}, state.subs >= m.subs ? "✅" : "🔒"), h("div", {}, h("strong", {}, m.name), h("div.muted", {}, m.unlocks)))),
      ),
      state.videos.length ? h("h2", {}, "My latest videos") : null,
      state.videos.length ? videoList(state.videos.slice(0, 5)) : null,
    );
  }

  function videoList(videos) {
    const icon = (topic) => (R.TOPICS.find((t) => t.id === topic) || { emoji: "📹" }).emoji;
    return h(
      "ul.videos",
      {},
      videos.map((v) => h("li", {}, h("span.thumb", {}, icon(v.topic)), h("div", { style: "min-width:0" }, h("strong.title", {}, v.title), h("div.muted", {}, `👀 ${subs(v.views)} views · 👍 ${subs(v.likes)} · +${subs(v.subs)} subs · ${money(v.money)}`)))),
    );
  }

  function celebrateMilestone(m) {
    sounds.win();
    confetti(m.subs >= 1e6 ? 150 : 80);
    const o = overlay(
      m.name,
      h("div", { style: "font-size:64px" }, m.subs >= 1e6 ? "🏆" : "🎉"),
      h("div.big", {}, `${m.name}!`),
      h("p", {}, `Unlocked: ${m.unlocks}`),
      h("button.btn", { onclick: () => (o.remove(), render()) }, "Awesome!"),
    );
  }

  /* ---------------------------------------------------------------- */
  /* Racing                                                            */
  /* ---------------------------------------------------------------- */

  /** Control points of each track (in a 1000 × 640 world), smoothed into a loop. */
  const SHAPES = {
    rookie: [[160, 320], [250, 140], [500, 95], [750, 140], [845, 320], [750, 500], [500, 545], [250, 500]],
    desert: [[120, 300], [215, 110], [420, 150], [520, 320], [650, 135], [860, 170], [880, 430], [700, 540], [460, 470], [250, 560]],
    city: [[120, 120], [500, 110], [880, 120], [890, 320], [600, 320], [590, 520], [300, 530], [110, 520], [110, 320]],
    mountain: [[95, 320], [190, 110], [340, 250], [460, 85], [600, 250], [760, 95], [905, 300], [790, 545], [560, 430], [420, 560], [240, 470]],
  };
  const LOOK = {
    rookie: { ground: "#2f8f3a", road: "#4a4a55", edge: "#f4f1ff", deco: "🌳" },
    desert: { ground: "#d9a85b", road: "#6b5a4a", edge: "#ffe1a6", deco: "🌵" },
    city: { ground: "#141a2e", road: "#2b2f3f", edge: "#ffcf3d", deco: "🏢" },
    mountain: { ground: "#7d8a99", road: "#3d3f48", edge: "#ffffff", deco: "🌲" },
  };
  const ROAD = 84;
  /** Testing only: the address ending in #autopilot drives your car for you. */
  const AUTOPILOT = location.hash === "#autopilot";
  const WORLD = { w: 1000, h: 640 };

  /** A smooth closed path through the control points, with distances along it. */
  function buildTrack(id) {
    const c = SHAPES[id];
    const pts = [];
    for (let i = 0; i < c.length; i++) {
      const p0 = c[(i - 1 + c.length) % c.length], p1 = c[i], p2 = c[(i + 1) % c.length], p3 = c[(i + 2) % c.length];
      for (let k = 0; k < 24; k++) {
        const t = k / 24, t2 = t * t, t3 = t2 * t;
        const f = (a, b, cc, d) => 0.5 * (2 * b + (-a + cc) * t + (2 * a - 5 * b + 4 * cc - d) * t2 + (-a + 3 * b - 3 * cc + d) * t3);
        pts.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
      }
    }
    const cum = [0];
    for (let i = 1; i <= pts.length; i++) {
      const a = pts[i - 1], b = pts[i % pts.length];
      cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    const length = cum[pts.length];
    // How sharp the road bends just ahead of each point (AI slows down there).
    const bend = pts.map((_, i) => {
      const a = pts[i], b = pts[(i + 6) % pts.length], d = pts[(i + 12) % pts.length];
      let turn = Math.atan2(d[1] - b[1], d[0] - b[0]) - Math.atan2(b[1] - a[1], b[0] - a[0]);
      while (turn > Math.PI) turn -= 2 * Math.PI;
      while (turn < -Math.PI) turn += 2 * Math.PI;
      return Math.abs(turn);
    });
    return { id, pts, cum, length, bend };
  }

  /** Where distance `s` along the track is: position, heading, and the point index. */
  function at(track, s) {
    const L = track.length;
    const d = ((s % L) + L) % L;
    let i = 0;
    let lo = 0, hi = track.pts.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (track.cum[mid] <= d) {
        i = mid;
        lo = mid + 1;
      }
      else hi = mid - 1;
    }
    const a = track.pts[i], b = track.pts[(i + 1) % track.pts.length];
    const seg = track.cum[i + 1] - track.cum[i] || 1;
    const t = (d - track.cum[i]) / seg;
    const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
    return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, angle, i };
  }

  /** Closest point of the road to (x, y): distance from the middle and distance along the track. */
  function nearest(track, x, y) {
    let best = Infinity, bestS = 0;
    const n = track.pts.length;
    for (let i = 0; i < n; i++) {
      const a = track.pts[i], b = track.pts[(i + 1) % n];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const len2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / len2));
      const px = a[0] + dx * t, py = a[1] + dy * t;
      const d = Math.hypot(x - px, y - py);
      if (d < best) {
        best = d;
        bestS = track.cum[i] + t * Math.sqrt(len2);
      }
    }
    return { dist: best, s: bestS };
  }

  function drawTrackImage(track, scale) {
    const look = LOOK[track.id];
    const c = document.createElement("canvas");
    c.width = WORLD.w * scale;
    c.height = WORLD.h * scale;
    const g = c.getContext("2d");
    g.scale(scale, scale);
    g.fillStyle = look.ground;
    g.fillRect(0, 0, WORLD.w, WORLD.h);
    // Scenery: a few emoji off the road.
    g.font = "26px serif";
    g.textAlign = "center";
    const rng = R.seeded(track.id.length * 99);
    for (let k = 0; k < 40; k++) {
      const x = 20 + rng() * 960, y = 20 + rng() * 600;
      if (nearest(track, x, y).dist > ROAD * 0.9) g.fillText(look.deco, x, y);
    }
    const path = () => {
      g.beginPath();
      track.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
    };
    g.lineJoin = "round";
    g.strokeStyle = look.edge;
    g.lineWidth = ROAD + 8;
    path();
    g.stroke();
    g.strokeStyle = look.road;
    g.lineWidth = ROAD;
    path();
    g.stroke();
    g.setLineDash([16, 18]);
    g.strokeStyle = "#ffffff55";
    g.lineWidth = 3;
    path();
    g.stroke();
    g.setLineDash([]);
    // Checkered start line.
    const s0 = at(track, 0);
    g.save();
    g.translate(s0.x, s0.y);
    g.rotate(s0.angle);
    for (let r = 0; r < 8; r++) for (let col = 0; col < 2; col++) {
      g.fillStyle = (r + col) % 2 ? "#111" : "#fff";
      g.fillRect(-4 + col * 5, -ROAD / 2 + (r * ROAD) / 8, 5, ROAD / 8);
    }
    g.restore();
    return c;
  }

  function drawCar(g, x, y, angle, color, me) {
    g.save();
    g.translate(x, y);
    g.rotate(angle);
    g.fillStyle = "#0006";
    g.fillRect(-12, -6, 26, 14);
    g.fillStyle = color;
    g.beginPath();
    g.roundRect(-13, -8, 26, 16, 5);
    g.fill();
    g.fillStyle = "#0b1020cc";
    g.fillRect(2, -6, 6, 12);
    g.fillStyle = "#ffffffaa";
    g.fillRect(-10, -2, 8, 4);
    if (me) {
      g.strokeStyle = "#fff";
      g.lineWidth = 2;
      g.beginPath();
      g.roundRect(-15, -10, 30, 20, 6);
      g.stroke();
    }
    g.restore();
  }

  function raceScreen() {
    const car = R.using(state, "car");
    return h(
      "section",
      {},
      h("h2", {}, "Pick a track"),
      h("p.muted", {}, `You're driving your ${car.emoji} ${car.name}. Race ${R.RACERS - 1} computer cars for ${R.TRACKS[0].laps} laps.`),
      h(
        "div.tracks",
        {},
        R.TRACKS.map((t, i) => {
          const open = R.trackUnlocked(state, t);
          const best = state.bestLaps[t.id];
          return h(
            `button.track-card${open ? "" : ".locked"}`,
            { disabled: !open, onclick: () => startRace(i) },
            h("span.big-emoji", {}, open ? t.emoji : "🔒"),
            h("strong", {}, t.name),
            h("span.muted", {}, open ? `1st place: ${money(t.prize)}` : `Unlocks at ${subs(t.subs)} subscribers`),
            best ? h("span.muted", {}, `Best lap ${R.lapTime(best)}`) : null,
          );
        }),
      ),
      h("p.muted", {}, "Steer with ← → (or A / D), brake with ↓ or Space. On a phone, use the buttons under the track. Your car speeds up by itself!"),
    );
  }

  function startRace(trackIndex) {
    stopScreen();
    const info = R.TRACKS[trackIndex];
    const track = buildTrack(info.id);
    const car = R.using(state, "car");
    const canvas = h("canvas.race", { "aria-label": `${info.name} race` });
    const hud = h("div.hud", {});
    const msg = h("div.race-msg", {}, "");
    /** Show a big message over the track for a moment. */
    const flash = (text, ms) => {
      msg.textContent = text;
      setTimeout(() => {
        if (!finished && msg.textContent === text) msg.textContent = "";
      }, ms);
    };
    const press = { left: false, right: false, brake: false };
    const hold = (key, label, text) =>
      h(
        "button.pad",
        {
          "aria-label": label,
          onpointerdown: (e) => (e.preventDefault(), (press[key] = true)),
          onpointerup: () => (press[key] = false),
          onpointerleave: () => (press[key] = false),
          onpointercancel: () => (press[key] = false),
          oncontextmenu: (e) => e.preventDefault(),
        },
        text,
      );
    const quit = h("button.btn.ghost.small", { onclick: () => go("race") }, "Quit race");
    app.querySelector("main").replaceChildren(
      h("section", {}, h("div.row", { style: "justify-content:space-between" }, h("strong", {}, `${info.emoji} ${info.name}`), quit), h("div.race-wrap", {}, canvas, msg), hud, h("div.pads", {}, hold("left", "Steer left", "◀"), hold("brake", "Brake", "🛑"), hold("right", "Steer right", "▶"))),
    );

    // Sizing: the whole track fits the width.
    const g = canvas.getContext("2d");
    let scale = 1, bg = null;
    function size() {
      const w = Math.min(canvas.parentElement.clientWidth, 960);
      const dpr = window.devicePixelRatio || 1;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${(w * WORLD.h) / WORLD.w}px`;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(((w * WORLD.h) / WORLD.w) * dpr);
      scale = canvas.width / WORLD.w;
      bg = drawTrackImage(track, scale);
    }
    size();
    window.addEventListener("resize", size);

    const keys = (down) => (e) => {
      const k = e.key.toLowerCase();
      if (k === "arrowleft" || k === "a") press.left = down;
      else if (k === "arrowright" || k === "d") press.right = down;
      else if (k === "arrowdown" || k === "s" || k === " ") press.brake = down;
      else return;
      e.preventDefault();
    };
    const kd = keys(true), ku = keys(false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);

    // Player starts just behind the line; computer cars in the lanes beside and behind.
    const start = at(track, -24);
    const me = { x: start.x, y: start.y, angle: start.angle, speed: 0, laps: 0, checkpoint: false, lastS: track.length - 24, lapStart: 0, bestLap: 0 };
    const colors = ["#ff8a3d", "#3dd6ff", "#b6ff3d"];
    const ai = colors.map((color, k) => ({ s: -24 - (k + 1) * 34, lane: [-22, 22, 0][k], speed: 0, pace: 0.9 + k * 0.035 + Math.random() * 0.04, color }));
    const totalLaps = info.laps;
    let time = -3; // countdown
    let lastBeep = 4;
    let finished = false;
    let raf = 0;
    let last = performance.now();

    function progressOf(p) {
      return p.laps * track.length + (p.checkpoint ? p.lastS : p.lastS > track.length / 2 ? p.lastS - track.length : p.lastS);
    }

    function step(dt) {
      time += dt;
      if (time < 0) {
        const n = Math.ceil(-time);
        if (n < lastBeep) {
          lastBeep = n;
          sounds.beep();
        }
        msg.textContent = String(n);
        return;
      }
      if (lastBeep > 0) {
        lastBeep = 0;
        sounds.go();
        flash("GO!", 700);
      }
      if (finished) return;

      // You
      const near = nearest(track, me.x, me.y);
      const onRoad = near.dist <= ROAD / 2 + 4;
      const top = car.top * (onRoad ? 1 : 0.45);
      if (press.brake) me.speed -= 420 * dt;
      else me.speed += car.accel * dt;
      if (me.speed > top) me.speed = Math.max(top, me.speed - 320 * dt);
      me.speed = Math.max(0, me.speed);
      let steer = (press.right ? 1 : 0) - (press.left ? 1 : 0);
      if (AUTOPILOT) {
        // Testing only: aim at the road a little ahead.
        const ahead = at(track, near.s + 70);
        let want = Math.atan2(ahead.y - me.y, ahead.x - me.x) - me.angle;
        while (want > Math.PI) want -= 2 * Math.PI;
        while (want < -Math.PI) want += 2 * Math.PI;
        steer = Math.max(-1, Math.min(1, want * 3));
      }
      me.angle += steer * car.turn * dt * Math.min(1, me.speed / 70);
      me.x = Math.max(8, Math.min(WORLD.w - 8, me.x + Math.cos(me.angle) * me.speed * dt));
      me.y = Math.max(8, Math.min(WORLD.h - 8, me.y + Math.sin(me.angle) * me.speed * dt));
      // Laps: halfway around sets the checkpoint; crossing the line after it counts a lap.
      const s = nearest(track, me.x, me.y).s;
      const L = track.length;
      if (s > L * 0.4 && s < L * 0.6) me.checkpoint = true;
      if (me.lastS > L * 0.75 && s < L * 0.25 && me.checkpoint) {
        me.laps += 1;
        me.checkpoint = false;
        const lap = (time - me.lapStart) * 1000;
        if (!me.bestLap || lap < me.bestLap) me.bestLap = lap;
        me.lapStart = time;
        if (me.laps < totalLaps) {
          flash(me.laps === totalLaps - 1 ? "FINAL LAP!" : `Lap ${me.laps + 1}`, 900);
          sounds.beep();
        }
      }
      me.lastS = s;

      // Computer cars follow the road, slowing for bends.
      for (const c of ai) {
        const here = at(track, c.s);
        const target = info.aiTop * c.pace * (1 - Math.min(0.4, track.bend[here.i] * 0.55));
        c.speed += Math.sign(target - c.speed) * Math.min(Math.abs(target - c.speed), 160 * dt);
        c.s += c.speed * dt;
      }

      if (me.laps >= totalLaps) finish();
    }

    function draw() {
      g.drawImage(bg, 0, 0);
      g.save();
      g.scale(scale, scale);
      for (const c of ai) {
        const p = at(track, c.s);
        const nx = -Math.sin(p.angle), ny = Math.cos(p.angle);
        drawCar(g, p.x + nx * c.lane, p.y + ny * c.lane, p.angle, c.color, false);
      }
      drawCar(g, me.x, me.y, me.angle, car.color, true);
      g.restore();
      const mine = progressOf(me);
      const place = 1 + ai.filter((c) => c.s > mine).length;
      hud.replaceChildren(
        h("span", {}, `Lap ${Math.min(me.laps + 1, totalLaps)}/${totalLaps}`),
        h("span", {}, `Place ${place}/${R.RACERS}`),
        h("span", {}, `⏱ ${R.lapTime(Math.max(0, time) * 1000)}`),
        h("span", {}, `${Math.round(me.speed / 2)} mph`),
      );
    }

    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      step(dt);
      draw();
      if (!finished) raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    function finish() {
      finished = true;
      const place = 1 + ai.filter((c) => c.s > totalLaps * track.length).length;
      const res = R.finishRace(state, trackIndex, place, me.bestLap);
      applyResult(res);
      draw();
      if (place === 1) {
        sounds.win();
        confetti(60);
      }
      else sounds.lose();
      msg.textContent = place === 1 ? "🏆 1st!" : `${place}${["st", "nd", "rd", "th"][place - 1]} place`;
      const o = overlay(
        "Race finished",
        h("div", { style: "font-size:56px" }, place === 1 ? "🏆" : place === 2 ? "🥈" : place === 3 ? "🥉" : "🏁"),
        h("div.big", {}, place === 1 ? "You won!" : `${place}${["st", "nd", "rd", "th"][place - 1]} place`),
        h("p", {}, `+${money(res.prize.money)} and +${subs(res.prize.subs)} subscribers`),
        h("p.muted", {}, `Time ${R.lapTime(time * 1000)} · best lap ${R.lapTime(me.bestLap)}. Your race was saved as a clip: make a Race highlight video in Create!`),
        h(
          "div.row",
          { style: "justify-content:center" },
          h("button.btn", { onclick: () => (o.remove(), startRace(trackIndex)) }, "Race again"),
          h("button.btn.ghost", { onclick: () => (o.remove(), go("create")) }, "Make a video"),
          h("button.btn.ghost", { onclick: () => (o.remove(), go("race")) }, "Tracks"),
        ),
      );
    }

    stopScreen = () => {
      finished = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", size);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
  }

  /* ---------------------------------------------------------------- */
  /* Gamer: the arcade game on your PC                                 */
  /* ---------------------------------------------------------------- */

  function gamerScreen() {
    const pc = R.using(state, "pc");
    const canvas = h("canvas.arcade", { width: 360, height: 480, "aria-label": "Block Dodge arcade game" });
    const startBtn = h("button.btn", { onclick: () => playArcade(canvas, startBtn) }, "▶ Play Block Dodge");
    setTimeout(() => drawArcadeIdle(canvas), 0);
    return h(
      "section",
      {},
      h("h2", {}, `${pc.emoji} ${pc.name}`),
      h("p.muted", {}, `Dodge the falling blocks and grab the 💰 coins. You have 3 lives! Your ${pc.name} pays ×${pc.mult} per point${state.arcadeBest ? ` · High score: ${state.arcadeBest}` : ""}.`),
      h("div.monitor", {}, canvas),
      h("div.row", { style: "justify-content:center" }, startBtn),
      h("p.muted", { style: "text-align:center" }, "Move with ← → (or A / D), or drag your finger on the screen."),
    );
  }

  function drawArcadeIdle(canvas) {
    const g = canvas.getContext("2d");
    g.fillStyle = "#05060f";
    g.fillRect(0, 0, 360, 480);
    g.fillStyle = "#3df2a0";
    g.font = "bold 28px monospace";
    g.textAlign = "center";
    g.fillText("BLOCK DODGE", 180, 210);
    g.font = "16px monospace";
    g.fillStyle = "#b7aedf";
    g.fillText("Press Play!", 180, 250);
  }

  function playArcade(canvas, btn) {
    stopScreen();
    btn.disabled = true;
    const g = canvas.getContext("2d");
    const W = 360, H = 480;
    const player = { x: W / 2, w: 34, h: 20 };
    let blocks = [], coins = [], time = 0, collected = 0, spawn = 0, coinSpawn = 1.5, over = false, raf = 0, last = performance.now();
    let lives = 3, safe = 0;
    const press = { left: false, right: false };
    let pointerX = null;
    const keys = (down) => (e) => {
      const k = e.key.toLowerCase();
      if (k === "arrowleft" || k === "a") press.left = down;
      else if (k === "arrowright" || k === "d") press.right = down;
      else return;
      e.preventDefault();
    };
    const kd = keys(true), ku = keys(false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    const toX = (e) => ((e.clientX - canvas.getBoundingClientRect().left) / canvas.getBoundingClientRect().width) * W;
    const pd = (e) => ((pointerX = toX(e)), canvas.setPointerCapture(e.pointerId));
    const pm = (e) => pointerX !== null && (pointerX = toX(e));
    const pu = () => (pointerX = null);
    canvas.addEventListener("pointerdown", pd);
    canvas.addEventListener("pointermove", pm);
    canvas.addEventListener("pointerup", pu);
    const score = () => Math.floor(time * 10) + collected * 25;

    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      time += dt;
      const speed = 160 + time * 9;
      if (pointerX !== null) player.x += Math.max(-420 * dt, Math.min(420 * dt, pointerX - player.x));
      player.x += ((press.right ? 1 : 0) - (press.left ? 1 : 0)) * 300 * dt;
      player.x = Math.max(player.w / 2, Math.min(W - player.w / 2, player.x));
      spawn -= dt;
      if (spawn <= 0) {
        const w = 30 + Math.random() * 50;
        blocks.push({ x: Math.random() * (W - w), y: -30, w, h: 18 + Math.random() * 14, hue: Math.floor(Math.random() * 360) });
        spawn = Math.max(0.22, 0.9 - time * 0.02);
      }
      coinSpawn -= dt;
      if (coinSpawn <= 0) {
        coins.push({ x: 20 + Math.random() * (W - 40), y: -20 });
        coinSpawn = 1.2 + Math.random() * 1.5;
      }
      const py = H - 40;
      safe = Math.max(0, safe - dt);
      for (const b of blocks) {
        b.y += speed * dt;
        const hit = b.y + b.h > py - player.h / 2 && b.y < py + player.h / 2 && b.x < player.x + player.w / 2 && b.x + b.w > player.x - player.w / 2;
        if (hit && !safe && !b.gone) {
          // 3 lives; after a hit you blink and can't be hit for a moment.
          b.gone = true;
          lives -= 1;
          safe = 1.5;
          sounds.crash();
          if (lives <= 0) over = true;
        }
      }
      coins = coins.filter((c) => {
        c.y += speed * 0.8 * dt;
        if (Math.abs(c.x - player.x) < 26 && Math.abs(c.y - py) < 22) return (collected++, sounds.coin(), false);
        return c.y < H + 20;
      });
      blocks = blocks.filter((b) => b.y < H + 40 && !b.gone);
      // Draw
      g.fillStyle = "#05060f";
      g.fillRect(0, 0, W, H);
      g.fillStyle = "#ffffff22";
      for (let i = 0; i < 30; i++) g.fillRect((i * 97) % W, (i * 53 + time * 40) % H, 2, 2);
      for (const b of blocks) {
        g.fillStyle = `hsl(${b.hue} 80% 55%)`;
        g.fillRect(b.x, b.y, b.w, b.h);
      }
      g.font = "22px serif";
      g.textAlign = "center";
      for (const c of coins) g.fillText("💰", c.x, c.y + 8);
      g.globalAlpha = safe && Math.floor(safe * 10) % 2 ? 0.3 : 1;
      g.fillStyle = "#3df2a0";
      g.fillRect(player.x - player.w / 2, py - player.h / 2, player.w, player.h);
      g.fillStyle = "#05060f";
      g.fillRect(player.x - 8, py - 4, 4, 4);
      g.fillRect(player.x + 4, py - 4, 4, 4);
      g.fillStyle = "#fff";
      g.font = "bold 18px monospace";
      g.textAlign = "left";
      g.globalAlpha = 1;
      g.fillText(`SCORE ${score()}`, 10, 24);
      g.textAlign = "right";
      g.fillText("❤️".repeat(lives) + "🖤".repeat(3 - lives), W - 10, 24);
      if (over) return end();
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    function cleanup() {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      canvas.removeEventListener("pointerdown", pd);
      canvas.removeEventListener("pointermove", pm);
      canvas.removeEventListener("pointerup", pu);
    }
    function end() {
      cleanup();
      sounds.crash();
      const sc = score();
      const res = R.finishArcade(state, sc);
      applyResult(res);
      if (res.record) confetti(40);
      const o = overlay(
        "Game over",
        h("div", { style: "font-size:52px" }, res.record ? "🏆" : "💥"),
        h("div.big", {}, `Score ${sc}`),
        res.record ? h("p", {}, "NEW HIGH SCORE!") : null,
        h("p", {}, `+${money(res.pay.money)} and +${subs(res.pay.subs)} subscribers`),
        h("div.row", { style: "justify-content:center" }, h("button.btn", { onclick: () => (o.remove(), go("gamer")) }, "Play again"), h("button.btn.ghost", { onclick: () => (o.remove(), go("create")) }, "Make a video")),
      );
    }
    stopScreen = () => cleanup();
  }

  /* ---------------------------------------------------------------- */
  /* Create: videos and live streams                                   */
  /* ---------------------------------------------------------------- */

  function createScreen() {
    const cam = R.using(state, "camera");
    const mic = R.using(state, "mic");
    const live = R.liveUnlocked(state);
    return h(
      "section",
      {},
      h(
        "div.activities",
        {},
        h("button.activity", { onclick: () => videoStudio() }, h("span.big-emoji", {}, "🎬"), h("strong", {}, "Make a video"), h("span.muted", {}, `With your ${cam.emoji} ${cam.name}`)),
        h(
          `button.activity${live ? "" : ".locked"}`,
          { disabled: !live, onclick: () => goLive() },
          h("span.big-emoji", {}, live ? "🔴" : "🔒"),
          h("strong", {}, "Go live"),
          h("span.muted", {}, live ? `With your ${mic.emoji} ${mic.name}` : `Unlocks at ${subs(R.LIVE_SUBS)} subscribers`),
        ),
      ),
      R.sponsored(state) ? h("p.muted", {}, "💼 Sponsor deal: +50% money from videos and streams!") : null,
      h("h2", {}, "My videos"),
      state.videos.length ? videoList(state.videos) : h("p.muted", {}, "No videos yet. Make your first one!"),
    );
  }

  function videoStudio() {
    const pick3 = { topic: null, title: null, thumb: null };
    const box = h("div.studio", {});
    const main = app.querySelector("main");
    const back = h("button.btn.ghost.small", { onclick: () => go("create") }, "← Back");
    main.replaceChildren(h("section", {}, h("div.row", { style: "justify-content:space-between" }, h("h2", { style: "margin:0" }, "🎬 New video"), back), box));

    function stepTopic() {
      box.replaceChildren(
        h("h3", {}, "1. What's it about?"),
        h(
          "div.choices",
          {},
          R.TOPICS.map((t) => {
            const problem = R.topicProblem(state, t.id);
            const repeats = state.recentTopics.filter((x) => x === t.id).length;
            return h(
              "button.choice",
              { disabled: !!problem, onclick: () => ((pick3.topic = t.id), stepTitle()) },
              h("span.big-emoji", {}, t.emoji),
              h("strong", {}, t.name),
              h("span.muted", {}, problem || (repeats ? "Made recently: fewer views" : "Fresh topic!")),
            );
          }),
        ),
      );
    }
    function stepTitle() {
      box.replaceChildren(
        h("h3", {}, "2. Pick a title"),
        h(
          "div.choices.list",
          {},
          R.titlesFor(state, pick3.topic).map((t) =>
            h(
              "button.choice",
              { onclick: () => ((pick3.title = t), stepThumb()) },
              h("strong", {}, t.text),
              h("span.muted", {}, t.style === "clickbait" ? "More views, fewer likes" : t.style === "honest" ? "Fewer views, more likes" : "Balanced"),
            ),
          ),
        ),
      );
    }
    function stepThumb() {
      box.replaceChildren(
        h("h3", {}, "3. Pick a thumbnail"),
        h(
          "div.choices",
          {},
          R.THUMBS.map((t) => h("button.choice", { onclick: () => ((pick3.thumb = t.id), stepEdit()) }, h(`span.thumb-pic.${t.id}`, {}, t.emoji), h("strong", {}, t.name))),
        ),
      );
    }
    function stepEdit() {
      // Editing game: tap Cut! when the marker is in the green zone, 3 times.
      const bar = h("div.edit-bar", {});
      const zone = h("div.edit-zone", {});
      const marker = h("div.edit-marker", {});
      bar.append(zone, marker);
      const info = h("p.muted", {}, "Tap CUT! when the line is in the green part. 3 cuts.");
      const cut = h("button.btn.big-btn", {}, "✂️ CUT!");
      box.replaceChildren(h("h3", {}, "4. Edit your video"), bar, h("div.row", { style: "justify-content:center" }, cut), info);
      const scores = [];
      let zoneAt = 0.2 + Math.random() * 0.6;
      const zoneW = 0.16;
      zone.style.left = `${(zoneAt - zoneW / 2) * 100}%`;
      zone.style.width = `${zoneW * 100}%`;
      let t = 0, raf = 0, last = performance.now();
      const speed = 0.9;
      function frame(now) {
        t += ((now - last) / 1000) * speed * (1 + scores.length * 0.35);
        last = now;
        const pos = 1 - Math.abs((t % 2) - 1);
        marker.style.left = `${pos * 100}%`;
        marker.dataset.pos = String(pos);
        raf = requestAnimationFrame(frame);
      }
      raf = requestAnimationFrame(frame);
      stopScreen = () => cancelAnimationFrame(raf);
      cut.addEventListener("click", () => {
        const pos = Number(marker.dataset.pos || 0);
        const q = Math.max(0, 1 - Math.abs(pos - zoneAt) / 0.35);
        scores.push(q);
        sounds.click();
        info.textContent = q > 0.8 ? "Perfect cut! ✨" : q > 0.5 ? "Nice cut!" : "Oops, a bit off.";
        zoneAt = 0.2 + Math.random() * 0.6;
        zone.style.left = `${(zoneAt - zoneW / 2) * 100}%`;
        if (scores.length === 3) {
          cancelAnimationFrame(raf);
          stopScreen = () => {};
          post(scores.reduce((a, b) => a + b, 0) / 3);
        }
      });
    }
    function post(quality) {
      const res = R.postVideo(state, { topic: pick3.topic, titleStyle: pick3.title.style, title: pick3.title.text, thumb: pick3.thumb, quality });
      if (!res.ok) return toast(res.reason);
      const v = res.video;
      const views = h("span.count", {}, "0"), likes = h("span.count", {}, "0"), newSubs = h("span.count", {}, "0"), cash = h("span.count", {}, "$0");
      box.replaceChildren(
        h("h3", {}, "Posted! 🎉"),
        h("div.panel.posted", {}, h(`span.thumb-pic.${pick3.thumb}`, {}, R.THUMBS.find((t) => t.id === pick3.thumb).emoji), h("strong", {}, v.title), h("div.muted", {}, `Editing quality: ${Math.round(quality * 100)}%`)),
        h("div.stats-row", {}, h("div", {}, "👀", views, h("small", {}, "views")), h("div", {}, "👍", likes, h("small", {}, "likes")), h("div", {}, "👥", newSubs, h("small", {}, "new subs")), h("div", {}, "💵", cash, h("small", {}, "earned"))),
        h("div.row", { style: "justify-content:center" }, h("button.btn", { onclick: () => videoStudio() }, "Make another"), h("button.btn.ghost", { onclick: () => go("create") }, "Done")),
      );
      const t0 = performance.now();
      let raf = 0;
      const tick = (now) => {
        const p = Math.min(1, (now - t0) / 2200);
        const e = 1 - (1 - p) ** 3;
        views.textContent = subs(Math.round(v.views * e));
        likes.textContent = subs(Math.round(v.likes * e));
        newSubs.textContent = `+${subs(Math.round(v.subs * e))}`;
        cash.textContent = money(Math.round(v.money * e));
        if (p < 1) raf = requestAnimationFrame(tick);
        else {
          applyResult(res);
          sounds.coin();
          render();
          videoStudioDone();
        }
      };
      raf = requestAnimationFrame(tick);
      stopScreen = () => cancelAnimationFrame(raf);
      // After the count-up, keep this screen (render() rebuilt the top bar numbers).
      function videoStudioDone() {
        stopScreen = () => {};
        const main = app.querySelector("main");
        main.replaceChildren(h("section", {}, h("h2", {}, "🎬 New video"), box));
      }
    }
    stepTopic();
  }

  function goLive() {
    stopScreen();
    const mic = R.using(state, "mic");
    let viewers = R.liveStartViewers(state);
    let peak = viewers, good = 0, missed = 0, tips = 0, left = 40, raf = 0, last = performance.now(), nextMsg = 1;
    const viewersEl = h("strong.live-viewers", {}, "");
    const timeEl = h("span.muted", {}, "");
    const tipsEl = h("span.muted", {}, "");
    const chat = h("ul.chat", { "aria-live": "polite" });
    const end = h("button.btn.ghost.small", { onclick: () => finish() }, "End stream");
    app.querySelector("main").replaceChildren(
      h(
        "section",
        {},
        h("div.row", { style: "justify-content:space-between" }, h("span.live-dot", {}, "🔴 LIVE"), viewersEl, timeEl, end),
        h("p.muted", {}, `Answer questions, thank donations and ban trolls fast! (${mic.emoji} ${mic.name})`),
        chat,
        tipsEl,
      ),
    );
    const NAMES = ["speedyKid", "racefan99", "turboTom", "pixelPam", "gamerGus", "lilDrift", "noobMaster", "zoomZoe", "kartKing", "streamSam"];
    const TYPES = [
      { kind: "question", weight: 4, action: "Reply", texts: ["What car is that?", "How do you drift so good?", "What's your high score?", "Can you race City Night?", "Favorite track?"] },
      { kind: "donation", weight: 2, action: "Thank!", texts: ["Keep it up!! 🔥", "For a faster car!", "Love the streams!", "GG!"] },
      { kind: "troll", weight: 2, action: "Ban", texts: ["this is boring lol", "u cant drive", "SPAM SPAM SPAM", "first!!1!"] },
      { kind: "chat", weight: 4, action: null, texts: ["hi!!", "LETS GOOO", "🔥🔥🔥", "W stream", "hype", "😂😂"] },
    ];
    const pickType = () => {
      let r = Math.random() * TYPES.reduce((n, t) => n + t.weight, 0);
      return TYPES.find((t) => (r -= t.weight) <= 0) || TYPES[0];
    };
    function addMessage() {
      const type = pickType();
      const amount = type.kind === "donation" ? Math.round(5 + viewers * (0.05 + Math.random() * 0.1)) : 0;
      let done = false;
      const li = h(`li.msg-${type.kind}`, {}, h("strong", {}, NAMES[Math.floor(Math.random() * NAMES.length)]), " ", pick(type.texts), amount ? h("span.tip", {}, ` 💵 $${amount}`) : null);
      if (type.action) {
        const btn = h(
          "button.btn.small",
          {
            onclick: () => {
              if (done) return;
              done = true;
              good++;
              viewers = Math.round(viewers * 1.08 + 2);
              if (amount) {
                tips += amount;
                sounds.coin();
              }
              else sounds.click();
              li.classList.add("handled");
              btn.remove();
            },
          },
          type.action,
        );
        li.append(btn);
        setTimeout(() => {
          if (done || left <= 0) return;
          done = true;
          missed++;
          viewers = Math.max(3, Math.round(viewers * 0.93));
          li.classList.add("missed");
          btn.remove();
        }, 4000);
      }
      chat.prepend(li);
      while (chat.children.length > 7) chat.lastChild.remove();
    }
    function frame(now) {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      left -= dt;
      nextMsg -= dt;
      if (nextMsg <= 0) {
        addMessage();
        nextMsg = 0.7 + Math.random() * 0.8;
      }
      if (Math.random() < dt * 2) viewers = Math.max(3, viewers + Math.round((Math.random() - 0.45) * 3));
      peak = Math.max(peak, viewers);
      viewersEl.textContent = `👀 ${subs(viewers)} watching`;
      timeEl.textContent = `⏱ ${Math.max(0, Math.ceil(left))}s`;
      tipsEl.textContent = `Tips so far: $${tips}`;
      if (left <= 0) return finish();
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    let ended = false;
    function finish() {
      if (ended) return;
      ended = true;
      left = 0;
      cancelAnimationFrame(raf);
      stopScreen = () => {};
      const happy = good + missed ? good / (good + missed) : 0.5;
      const res = R.finishLive(state, { peak, happy, tips });
      if (!res.ok) return toast(res.reason), go("create");
      applyResult(res);
      sounds.win();
      const o = overlay(
        "Stream ended",
        h("div", { style: "font-size:52px" }, "📺"),
        h("div.big", {}, "Stream over!"),
        h("p", {}, `Peak ${subs(peak)} viewers · chat happiness ${Math.round(happy * 100)}%`),
        h("p", {}, `+${money(res.money)} and +${subs(res.subs)} subscribers`),
        h("button.btn", { onclick: () => (o.remove(), go("create")) }, "Nice!"),
      );
    }
    stopScreen = () => ((ended = true), cancelAnimationFrame(raf));
  }

  /* ---------------------------------------------------------------- */
  /* Shop                                                              */
  /* ---------------------------------------------------------------- */

  function shopScreen() {
    const section = (kind, title, stat) =>
      h(
        "div",
        {},
        h("h2", {}, title),
        h(
          "div.shop",
          {},
          R.GEAR[kind].map((g) => {
            const owned = state.owned[kind].includes(g.id);
            const inUse = state.using[kind] === g.id;
            return h(
              `div.shop-item${inUse ? ".using" : ""}`,
              {},
              h("span.big-emoji", {}, g.emoji),
              h("strong", {}, g.name),
              h("span.muted", {}, stat(g)),
              inUse
                ? h("span.tag", {}, "Using")
                : h(
                    "button.btn.small",
                    {
                      disabled: !owned && state.money < g.price,
                      onclick: () => {
                        const res = R.buy(state, kind, g.id);
                        if (!res.ok) return toast(res.reason);
                        setState(res.state);
                        if (owned) sounds.click();
                        else {
                          sounds.coin();
                          confetti(15);
                        }
                        toast(owned ? `Now using ${g.name}` : `You bought the ${g.name}!`);
                        render();
                      },
                    },
                    owned ? "Use" : `Buy ${money(g.price)}`,
                  ),
            );
          }),
        ),
      );
    return h(
      "section",
      {},
      section("car", "🏎️ Cars", (c) => `Top speed ${Math.round(c.top / 2)} mph`),
      section("pc", "🖥️ Gaming PCs", (p) => `Arcade pays ×${p.mult}`),
      section("camera", "🎥 Cameras", (c) => `Video views ×${c.mult}`),
      section("mic", "🎙️ Microphones", (m) => `Live viewers and pay ×${m.mult}`),
    );
  }

  render();
})();
