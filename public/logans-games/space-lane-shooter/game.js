/* Space Lane Shooter: the hangar, shop and the action, by Logan.
 * The rules live in logic.js. */
(function () {
  "use strict";
  const S = window.SpaceLanes;
  const SAVE_KEY = "logans-games:space-lane-shooter";
  const MUTE_KEY = "logans-games:space-lane-shooter:muted";
  /** Testing only: the address ending in #autopilot flies the ship for you. */
  const AUTOPILOT = location.hash === "#autopilot";
  const app = document.getElementById("app");

  let state = S.loadState(read(SAVE_KEY));
  let muted = read(MUTE_KEY) === "1";
  let stopGame = () => {};

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

  /* ---------------------------------------------------------------- */
  /* Helpers, sounds                                                   */
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
  function toast(text) {
    document.querySelector(".toast")?.remove();
    const t = h("div.toast", { role: "status" }, text);
    document.body.append(t);
    setTimeout(() => t.remove(), 2400);
  }
  function confetti(count = 40) {
    const bits = ["⭐", "✨", "🌟", "💫", "🚀", "🎉"];
    for (let i = 0; i < count; i++) {
      const c = h("div.confetti", { style: `left:${Math.random() * 100}vw;animation-duration:${2 + Math.random() * 2.5}s;animation-delay:${Math.random() * 0.6}s` }, bits[i % bits.length]);
      document.body.append(c);
      setTimeout(() => c.remove(), 5500);
    }
  }
  let audio = null;
  function tone(freq, start, length, type = "square", volume = 0.05) {
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
    pop: () => tone(520 + Math.random() * 200, 0, 0.08, "square", 0.04),
    hurt: () => tone(110, 0, 0.35, "sawtooth", 0.08),
    power: () => [0, 4, 7].forEach((st, i) => tone(660 * 2 ** (st / 12), i * 0.06, 0.15, "triangle", 0.07)),
    boom: () => tone(70, 0, 0.6, "sawtooth", 0.1),
    level: () => [0, 4, 7, 12].forEach((st, i) => tone(523 * 2 ** (st / 12), i * 0.1, 0.25, "triangle", 0.08)),
    over: () => [7, 4, 0].forEach((st, i) => tone(330 * 2 ** (st / 12), i * 0.15, 0.3, "triangle", 0.08)),
    coin: () => { tone(988, 0, 0.07, "square", 0.04); tone(1319, 0.07, 0.15, "square", 0.04); },
  };
  const short = S.short;

  /* ---------------------------------------------------------------- */
  /* Hangar (home), pilots, upgrades, high scores                      */
  /* ---------------------------------------------------------------- */

  function topBar() {
    return h(
      "header.top",
      {},
      h("h1", {}, h("a", { href: "/logans-games" }, "🚀 Space Lane Shooter")),
      h("span.pill", { title: `${state.coins} star coins` }, `⭐ ${short(state.coins)}`),
      h(
        "button.icon-btn",
        {
          "aria-label": muted ? "Turn sound on" : "Turn sound off",
          onclick: () => {
            muted = !muted;
            write(MUTE_KEY, muted ? "1" : "0");
            hangar();
          },
        },
        muted ? "🔇" : "🔊",
      ),
    );
  }

  function hangar() {
    stopGame();
    stopGame = () => {};
    const pilot = S.pilotById(state.pilot);
    const stats = S.shipStats(state);
    app.replaceChildren(
      topBar(),
      h(
        "main",
        {},
        h(
          "section.hero",
          {},
          h("div.hero-pilot", {}, pilot.emoji, h("span.hero-ship", {}, "🚀")),
          h("h2", {}, pilot.name),
          h("p.muted", {}, pilot.power),
          h("p.muted", {}, `❤️ ${stats.hearts} hearts · 💥 power ${stats.damage} · ⚡ ${stats.shotsPerSecond.toFixed(1)} shots/s`),
          h("button.btn.big-btn", { onclick: () => play() }, "▶ PLAY"),
          state.bestLevel ? h("p.muted", {}, `Best: level ${state.bestLevel}${state.scores[0] ? ` · score ${state.scores[0].score.toLocaleString("en-US")}` : ""}`) : h("p.muted", {}, "Dodge, blast, and beat a boss every 5 levels!"),
        ),
        h("h2", {}, "Pilots"),
        h(
          "div.cards",
          {},
          S.PILOTS.map((p) => {
            const owned = state.pilots.includes(p.id);
            const using = state.pilot === p.id;
            return h(
              `div.card${using ? ".using" : ""}`,
              {},
              h("span.card-emoji", {}, p.emoji),
              h("strong", {}, p.name),
              h("span.muted", {}, p.power),
              using
                ? h("span.tag", {}, "Flying")
                : h(
                    "button.btn.small",
                    {
                      disabled: !owned && state.coins < p.price,
                      onclick: () => {
                        const res = S.choosePilot(state, p.id);
                        if (!res.ok) return toast(res.reason);
                        setState(res.state);
                        if (!owned) {
                          sounds.power();
                          confetti(20);
                          toast(`${p.name} joined your crew!`);
                        }
                        hangar();
                      },
                    },
                    owned ? "Fly" : `Unlock ⭐ ${short(p.price)}`,
                  ),
            );
          }),
        ),
        h("h2", {}, "Upgrades"),
        h(
          "div.cards",
          {},
          S.UPGRADES.map((u) => {
            const lvl = state.upgrades[u.id] || 0;
            const cost = S.upgradeCost(state, u.id);
            return h(
              "div.card",
              {},
              h("span.card-emoji", {}, u.emoji),
              h("strong", {}, u.name),
              h("div.pips", { "aria-label": `Level ${lvl} of ${u.costs.length}` }, u.costs.map((_, i) => h(`span${i < lvl ? ".on" : ""}`, {}))),
              cost === null
                ? h("span.tag", {}, "MAX")
                : h(
                    "button.btn.small",
                    {
                      disabled: state.coins < cost,
                      onclick: () => {
                        const res = S.buyUpgrade(state, u.id);
                        if (!res.ok) return toast(res.reason);
                        setState(res.state);
                        sounds.coin();
                        hangar();
                      },
                    },
                    `Upgrade ⭐ ${short(cost)}`,
                  ),
            );
          }),
        ),
        h("h2", {}, "🏆 High scores"),
        state.scores.length
          ? h(
              "ol.scores",
              {},
              state.scores.map((s) =>
                h("li", {}, h("span", {}, S.pilotById(s.pilot).emoji), h("strong", {}, s.score.toLocaleString("en-US")), h("span.muted", {}, `level ${s.level} · ${new Date(s.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`)),
              ),
            )
          : h("p.muted", {}, "No scores yet. Go set one!"),
      ),
      h(
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
              if (confirm("Start over? This deletes your star coins, pilots, upgrades and scores on this device.")) {
                setState(S.newState());
                hangar();
              }
            },
          },
          "Reset game",
        ),
      ),
    );
  }

  /* ---------------------------------------------------------------- */
  /* The action                                                        */
  /* ---------------------------------------------------------------- */

  const W = 360;
  const H = 640;
  const LANE_W = W / S.LANES;
  const SHIP_Y = H - 70;
  const laneX = (lane) => LANE_W * lane + LANE_W / 2;

  function play() {
    stopGame();
    const pilot = S.pilotById(state.pilot);
    const stats = S.shipStats(state);
    const canvas = h("canvas.game", { "aria-label": "Space Lane Shooter" });
    const pauseBtn = h("button.icon-btn", { "aria-label": "Pause" }, "⏸");
    const pad = (label, text, dir) => h("button.pad", { "aria-label": label, onpointerdown: (e) => (e.preventDefault(), move(dir)) }, text);
    app.replaceChildren(
      h("main.playing", {}, h("div.stage", {}, canvas, h("div.stage-top", {}, pauseBtn)), h("div.pads", {}, pad("Move left", "◀", -1), pad("Move right", "▶", 1))),
    );
    const g = canvas.getContext("2d");
    function size() {
      const maxH = window.innerHeight - 120;
      const w = Math.min(canvas.parentElement.clientWidth, 480, (maxH * W) / H);
      const dpr = window.devicePixelRatio || 1;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${(w * H) / W}px`;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(((w * H) / W) * dpr);
    }
    size();
    window.addEventListener("resize", size);

    // Run state
    let lane = 2;
    let shipX = laneX(lane);
    let hearts = stats.hearts;
    const maxHearts = stats.hearts + 2;
    let score = 0, coins = 0, level = 1;
    let bullets = [], enemies = [], shots = [], drops = [], floaters = [];
    let boss = null;
    let plan = [], planT = 0, levelDone = false, levelBanner = 0;
    let fireT = 0, hurtT = 0;
    const power = { triple: 0, laser: 0, shield: 0 };
    let paused = false, over = false, raf = 0, last = performance.now();
    const stars = Array.from({ length: 60 }, () => ({ x: Math.random() * W, y: Math.random() * H, s: 20 + Math.random() * 80 }));

    function startLevel() {
      levelDone = false;
      levelBanner = 1.8;
      planT = 0;
      if (S.isBossLevel(level)) {
        const b = S.bossFor(level);
        boss = { ...b, maxHp: b.hp, x: W / 2, y: -80, dir: 1, fireT: 1.5 };
        plan = [];
      } else {
        boss = null;
        plan = S.levelPlan(level);
      }
    }
    startLevel();

    function move(dir) {
      if (paused || over) return;
      lane = Math.max(0, Math.min(S.LANES - 1, lane + dir));
    }
    const kd = (e) => {
      const k = e.key.toLowerCase();
      if (k === "arrowleft" || k === "a") move(-1);
      else if (k === "arrowright" || k === "d") move(1);
      else if (k === "p" || k === "escape") togglePause();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", kd);
    // Tap a side of the screen, or swipe, to change lanes.
    let downX = null;
    const pd = (e) => (downX = e.clientX);
    const pu = (e) => {
      if (downX === null) return;
      const r = canvas.getBoundingClientRect();
      const dx = e.clientX - downX;
      if (Math.abs(dx) > 30) move(dx > 0 ? 1 : -1);
      else move(e.clientX - r.left < r.width / 2 ? -1 : 1);
      downX = null;
    };
    canvas.addEventListener("pointerdown", pd);
    canvas.addEventListener("pointerup", pu);
    function togglePause() {
      if (over) return;
      paused = !paused;
      pauseBtn.textContent = paused ? "▶" : "⏸";
      pauseBtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
    }
    pauseBtn.addEventListener("click", togglePause);
    const onHide = () => document.hidden && !paused && togglePause();
    document.addEventListener("visibilitychange", onHide);

    function float(text, x, y, color = "#ffe066") {
      // Keep the words on screen near the edges.
      floaters.push({ text, x: Math.max(70, Math.min(W - 70, x)), y, t: 1, color });
    }
    function kill(e) {
      e.dead = true;
      score += e.points;
      const c = Math.round(e.coins * stats.coinMult);
      coins += c;
      float(`+${c}⭐`, e.x, e.y);
      sounds.pop();
      if (Math.random() < stats.dropChance) drops.push({ lane: e.lane, y: e.y, id: S.pickPowerup() });
    }
    function hurt() {
      if (power.shield > 0 || hurtT > 0) return;
      hearts -= 1;
      hurtT = 1.2;
      sounds.hurt();
      if (navigator.vibrate) navigator.vibrate(120);
      if (hearts <= 0) end();
    }
    function collect(id) {
      sounds.power();
      const p = S.POWERUPS.find((x) => x.id === id);
      float(`${p.emoji} ${p.name}!`, shipX, SHIP_Y - 40, "#9be7ff");
      if (id === "triple" || id === "laser") power[id] = stats.powerSeconds;
      else if (id === "shield") power.shield = stats.shieldSeconds;
      else if (id === "heart") hearts = Math.min(maxHearts, hearts + 1);
      else if (id === "bomb") {
        sounds.boom();
        for (const e of enemies) if (!e.dead && e.y > -20) kill(e);
        shots = [];
        if (boss && boss.y > 0) boss.hp -= Math.ceil(boss.maxHp * 0.15);
        flash = 0.4;
      }
    }
    let flash = 0;

    function autopilot() {
      // Testing only: dodge what's about to hit, otherwise line up with the closest enemy.
      const danger = (l) => enemies.some((e) => !e.dead && e.lane === l && e.y > SHIP_Y - 160 && e.y < SHIP_Y + 20) || shots.some((s) => s.lane === l && s.y > SHIP_Y - 140 && s.y < SHIP_Y);
      const drop = drops.find((d) => d.y > SHIP_Y - 200);
      let target = lane;
      if (drop && !danger(drop.lane)) target = drop.lane;
      else if (boss) target = Math.max(0, Math.min(S.LANES - 1, Math.floor(boss.x / LANE_W)));
      else {
        const next = enemies.filter((e) => !e.dead && e.y < SHIP_Y - 160).sort((a, b) => b.y - a.y)[0];
        if (next) target = next.lane;
      }
      if (danger(target)) for (const l of [lane, lane - 1, lane + 1, lane - 2, lane + 2]) if (l >= 0 && l < S.LANES && !danger(l)) { target = l; break; }
      if (target !== lane) move(target > lane ? 1 : -1);
    }
    let autoT = 0;

    function step(dt) {
      for (const st of stars) st.y = (st.y + st.s * dt) % H;
      for (const k of Object.keys(power)) power[k] = Math.max(0, power[k] - dt);
      hurtT = Math.max(0, hurtT - dt);
      flash = Math.max(0, flash - dt);
      levelBanner = Math.max(0, levelBanner - dt);
      shipX += (laneX(lane) - shipX) * Math.min(1, dt * 18);
      if (AUTOPILOT && (autoT -= dt) <= 0) {
        autoT = 0.12;
        autopilot();
      }

      // Spawn the level's enemies on schedule.
      planT += dt;
      while (plan.length && plan[0].at <= planT) {
        const p = plan.shift();
        const e = S.enemyAt(p.type, level);
        enemies.push({ ...e, lane: p.lane, x: laneX(p.lane), y: -30, maxHp: e.hp, fireT: 1 + Math.random() * 1.5 });
      }

      // Fire
      fireT -= dt;
      if (fireT <= 0) {
        fireT = 1 / stats.shotsPerSecond;
        const lanes = power.triple > 0 ? [lane - 1, lane, lane + 1].filter((l) => l >= 0 && l < S.LANES) : [lane];
        const laser = power.laser > 0;
        for (const l of lanes) bullets.push({ lane: l, x: l === lane ? shipX : laneX(l), y: SHIP_Y - 26, dmg: stats.damage * (laser ? 2 : 1), pierce: laser || stats.pierce, laser, hit: new Set() });
      }
      for (const b of bullets) b.y -= 620 * dt;

      // Enemies move, shoot and get hit.
      for (const e of enemies) {
        if (e.dead) continue;
        e.y += e.speed * dt;
        // Bees zig-zag between lanes; sharks lunge into your lane halfway down.
        if (e.id === "bee" && e.y < SHIP_Y - 170) {
          e.switchT = (e.switchT ?? 0.6 + Math.random() * 0.8) - dt;
          if (e.switchT <= 0) {
            e.switchT = 0.8 + Math.random() * 0.8;
            e.lane = Math.max(0, Math.min(S.LANES - 1, e.lane + (Math.random() < 0.5 ? -1 : 1)));
          }
        }
        if (e.id === "shark" && !e.lunged && e.y > H * 0.42) {
          e.lunged = true;
          e.lane = lane;
        }
        e.x += (laneX(e.lane) - e.x) * Math.min(1, dt * 8);
        if (e.shoots && e.y > 20 && e.y < SHIP_Y - 120 && (e.fireT -= dt) <= 0) {
          e.fireT = 1.6 + Math.random() * 1.6;
          shots.push({ lane: e.lane, x: e.x, y: e.y + 16, egg: e.id === "chicken" });
        }
        for (const b of bullets) {
          if (b.gone || b.lane !== e.lane || b.hit.has(e) || Math.abs(b.y - e.y) > 22) continue;
          b.hit.add(e);
          e.hp -= b.dmg;
          if (!b.pierce) b.gone = true;
          if (e.hp <= 0) {
            kill(e);
            break;
          }
        }
        if (!e.dead && e.lane === lane && Math.abs(e.y - SHIP_Y) < 26) {
          e.dead = true;
          hurt();
        }
        if (e.y > H + 30) e.dead = true;
      }

      // Boss: slides in, moves side to side, fires spreads.
      if (boss) {
        if (boss.y < 90) boss.y += 60 * dt;
        else {
          boss.x += boss.dir * (50 + level * 2) * dt;
          if (boss.x < 90 || boss.x > W - 90) boss.dir *= -1;
          if ((boss.fireT -= dt) <= 0) {
            boss.fireT = Math.max(0.7, 1.8 - level * 0.03);
            const center = Math.max(0, Math.min(S.LANES - 1, Math.floor(boss.x / LANE_W)));
            const spread = Math.random() < 0.5 ? [center] : [center - 1, center + 1];
            for (const l of spread) if (l >= 0 && l < S.LANES) shots.push({ lane: l, x: laneX(l), y: boss.y + 40, egg: boss.id === "rooster" });
          }
        }
        for (const b of bullets) {
          if (b.gone || b.y > boss.y + 45 || b.y < boss.y - 45 || Math.abs(b.x - boss.x) > 75) continue;
          boss.hp -= b.dmg;
          b.gone = true;
          if (Math.random() < 0.3) sounds.pop();
        }
        if (boss.hp <= 0) {
          score += boss.points;
          coins += Math.round(boss.coins * stats.coinMult);
          float(`BOSS DEFEATED! +${Math.round(boss.coins * stats.coinMult)}⭐`, boss.x, boss.y, "#ff9df4");
          sounds.boom();
          confetti(50);
          flash = 0.6;
          boss = null;
        }
      }

      // Enemy shots and power-ups fall down their lanes.
      for (const s of shots) {
        s.y += 260 * dt;
        if (s.lane === lane && Math.abs(s.y - SHIP_Y) < 18) {
          s.gone = true;
          hurt();
        }
      }
      for (const d of drops) {
        d.y += 130 * dt;
        if (d.lane === lane && Math.abs(d.y - SHIP_Y) < 28) {
          d.gone = true;
          collect(d.id);
        }
      }
      for (const f of floaters) {
        f.t -= dt;
        f.y -= 40 * dt;
      }
      bullets = bullets.filter((b) => !b.gone && b.y > -30);
      enemies = enemies.filter((e) => !e.dead);
      shots = shots.filter((s) => !s.gone && s.y < H + 20);
      drops = drops.filter((d) => !d.gone && d.y < H + 20);
      floaters = floaters.filter((f) => f.t > 0);

      // Level cleared?
      if (!levelDone && !plan.length && !enemies.length && !boss) {
        levelDone = true;
        score += 50 * level;
        sounds.level();
        setTimeout(() => {
          if (over) return;
          level += 1;
          startLevel();
        }, 1200);
      }
    }

    function draw() {
      const scale = canvas.width / W;
      g.setTransform(scale, 0, 0, scale, 0, 0);
      g.fillStyle = "#05061a";
      g.fillRect(0, 0, W, H);
      for (const st of stars) {
        g.fillStyle = `rgba(255,255,255,${0.3 + st.s / 160})`;
        g.fillRect(st.x, st.y, 1.5, 1.5);
      }
      g.strokeStyle = "#ffffff12";
      g.lineWidth = 1;
      for (let i = 1; i < S.LANES; i++) {
        g.beginPath();
        g.moveTo(i * LANE_W, 0);
        g.lineTo(i * LANE_W, H);
        g.stroke();
      }
      g.textAlign = "center";
      g.textBaseline = "middle";
      // Bullets
      for (const b of bullets) {
        g.fillStyle = b.laser ? "#ff5cf4" : "#3df2ff";
        g.fillRect(b.x - (b.laser ? 3 : 2), b.y - 10, b.laser ? 6 : 4, b.laser ? 24 : 14);
      }
      // Enemies
      g.font = "32px serif";
      for (const e of enemies) {
        g.fillText(e.emoji, e.x, e.y);
        if (e.maxHp > 1) {
          g.fillStyle = "#0008";
          g.fillRect(e.x - 18, e.y - 26, 36, 4);
          g.fillStyle = "#4ade80";
          g.fillRect(e.x - 18, e.y - 26, 36 * Math.max(0, e.hp / e.maxHp), 4);
        }
      }
      // Boss
      if (boss) {
        g.font = "92px serif";
        g.fillText(boss.emoji, boss.x, boss.y);
        if (boss.crown) {
          g.font = "36px serif";
          g.fillText("👑", boss.x, boss.y - 56);
        }
        g.fillStyle = "#0009";
        g.fillRect(20, 46, W - 40, 10);
        g.fillStyle = "#ff4f6d";
        g.fillRect(20, 46, (W - 40) * Math.max(0, boss.hp / boss.maxHp), 10);
        g.font = "bold 13px system-ui";
        g.fillStyle = "#fff";
        g.fillText(boss.name.toUpperCase(), W / 2, 36);
      }
      // Enemy shots and power-ups
      g.font = "16px serif";
      for (const s of shots) {
        if (s.egg) g.fillText("🥚", s.x, s.y);
        else {
          g.fillStyle = "#ff5c5c";
          g.beginPath();
          g.arc(s.x, s.y, 5, 0, Math.PI * 2);
          g.fill();
        }
      }
      g.font = "26px serif";
      for (const d of drops) {
        g.fillStyle = "#ffffff22";
        g.beginPath();
        g.arc(laneX(d.lane), d.y, 18, 0, Math.PI * 2);
        g.fill();
        g.fillText(S.POWERUPS.find((p) => p.id === d.id).emoji, laneX(d.lane), d.y);
      }
      // Ship with its animal pilot
      const blink = hurtT > 0 && Math.floor(hurtT * 10) % 2;
      g.globalAlpha = blink ? 0.35 : 1;
      g.fillStyle = "#c9d4ff";
      g.beginPath();
      g.moveTo(shipX, SHIP_Y - 30);
      g.lineTo(shipX + 24, SHIP_Y + 18);
      g.lineTo(shipX, SHIP_Y + 10);
      g.lineTo(shipX - 24, SHIP_Y + 18);
      g.closePath();
      g.fill();
      g.fillStyle = "#ff8a3d";
      g.fillRect(shipX - 6, SHIP_Y + 12, 12, 6 + Math.random() * 6);
      g.font = "24px serif";
      g.fillText(pilot.emoji, shipX, SHIP_Y - 2);
      g.globalAlpha = 1;
      if (power.shield > 0) {
        g.strokeStyle = "#7fe7ff";
        g.lineWidth = 3;
        g.beginPath();
        g.arc(shipX, SHIP_Y - 4, 34, 0, Math.PI * 2);
        g.stroke();
      }
      // Floating texts
      g.font = "bold 14px system-ui";
      for (const f of floaters) {
        g.globalAlpha = Math.max(0, f.t);
        g.fillStyle = f.color;
        g.fillText(f.text, f.x, f.y);
      }
      g.globalAlpha = 1;
      if (flash > 0) {
        g.fillStyle = `rgba(255,255,255,${flash})`;
        g.fillRect(0, 0, W, H);
      }
      // HUD
      g.textAlign = "left";
      g.font = "bold 15px system-ui";
      g.fillStyle = "#fff";
      g.fillText(`SCORE ${score.toLocaleString("en-US")}`, 10, 16);
      g.fillText(`⭐ ${coins}`, 10, H - 14);
      g.textAlign = "right";
      g.fillText(`LEVEL ${level}`, W - 52, 16);
      g.font = "14px serif";
      g.fillText("❤️".repeat(Math.max(0, hearts)), W - 10, H - 14);
      const timers = [["triple", "🔱"], ["laser", "🔆"], ["shield", "🫧"]].filter(([k]) => power[k] > 0);
      g.textAlign = "center";
      timers.forEach(([k, icon], i) => g.fillText(`${icon}${Math.ceil(power[k])}`, W / 2 + (i - (timers.length - 1) / 2) * 50, H - 14));
      if (levelBanner > 0 || paused) {
        g.fillStyle = "#000a";
        g.fillRect(0, H / 2 - 50, W, 100);
        g.fillStyle = "#fff";
        g.font = "900 34px system-ui";
        g.fillText(paused ? "PAUSED" : S.isBossLevel(level) ? "⚠ BOSS ⚠" : `LEVEL ${level}`, W / 2, H / 2 - 8);
        g.font = "15px system-ui";
        g.fillText(paused ? "Tap ▶ to keep going" : boss ? boss.name : "Get ready!", W / 2, H / 2 + 26);
      }
    }

    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!paused && !over) step(dt);
      draw();
      if (!over) raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    function cleanup() {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", size);
      window.removeEventListener("keydown", kd);
      document.removeEventListener("visibilitychange", onHide);
    }
    function end() {
      if (over) return;
      over = true;
      cleanup();
      draw();
      sounds.over();
      const res = S.finishRun(state, { score, level, coins });
      setState(res.state);
      if (res.best) confetti(80);
      const o = h(
        "div.overlay",
        { role: "dialog", "aria-label": "Game over" },
        h(
          "div.panel.dialog",
          {},
          h("div", { style: "font-size:56px" }, res.best ? "🏆" : "💥"),
          h("div.big", {}, res.best ? "NEW HIGH SCORE!" : "Game over"),
          h("p", {}, `Score ${score.toLocaleString("en-US")} · level ${level}`),
          h("p", {}, `+${coins} ⭐ star coins (you have ${short(res.state.coins)})`),
          res.rank && !res.best ? h("p.muted", {}, `#${res.rank} on your high scores!`) : null,
          h(
            "div.row",
            {},
            h("button.btn", { onclick: () => (o.remove(), play()) }, "Play again"),
            h("button.btn.ghost", { onclick: () => (o.remove(), hangar()) }, "Hangar & shop"),
          ),
        ),
      );
      document.body.append(o);
    }
    stopGame = () => {
      over = true;
      cleanup();
    };
  }

  hangar();
})();
