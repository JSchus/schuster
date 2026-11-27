/* THE GAME: drawing, controls, creatures and saving, by Logan.
 * The rules live in logic.js. */
(function () {
  "use strict";
  const G = window.TheGame;
  const INDEX_KEY = "logans-games:the-game:worlds";
  const WORLD_KEY = (id) => `logans-games:the-game:world:${id}`;
  const MUTE_KEY = "logans-games:the-game:muted";
  /** Testing only: the address ending in #debug exposes the game to test scripts. */
  const DEBUG = location.hash === "#debug";
  const app = document.getElementById("app");
  let muted = read(MUTE_KEY) === "1";
  let stop = () => {};

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
      return true;
    } catch {
      return false;
    }
  }
  function remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {}
  }

  /* ---------------------------------------------------------------- */
  /* Helpers                                                           */
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
    setTimeout(() => t.remove(), 2200);
  }
  let audio = null;
  function tone(freq, length, type = "square", volume = 0.04) {
    if (muted) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const t = audio.currentTime;
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
    dig: () => tone(160 + Math.random() * 80, 0.05, "square", 0.025),
    pop: () => tone(520, 0.08, "triangle", 0.05),
    place: () => tone(260, 0.06, "square", 0.04),
    hurt: () => tone(110, 0.25, "sawtooth", 0.07),
    hit: () => tone(200, 0.08, "sawtooth", 0.05),
    eat: () => [0, 0.1].forEach((d) => setTimeout(() => tone(330, 0.06, "triangle", 0.05), d * 1000)),
    craft: () => [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.1, "triangle", 0.05), i * 70)),
  };

  /* ---------------------------------------------------------------- */
  /* World list                                                        */
  /* ---------------------------------------------------------------- */

  function listWorlds() {
    try {
      const list = JSON.parse(read(INDEX_KEY) || "[]");
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }
  function saveIndex(list) {
    write(INDEX_KEY, JSON.stringify(list));
  }
  function persist(world) {
    world.played = Date.now();
    const ok = write(WORLD_KEY(world.id), JSON.stringify(G.saveWorld(world)));
    const list = listWorlds().filter((w) => w.id !== world.id);
    list.unshift({ id: world.id, name: world.name, mode: world.mode, played: world.played });
    saveIndex(list);
    if (!ok) toast("Couldn't save: this device's storage is full. Delete an old world.");
    return ok;
  }

  function menu() {
    stop();
    stop = () => {};
    const worlds = listWorlds();
    const name = h("input", { id: "world-name", maxlength: "40", placeholder: "My world", value: `World ${worlds.length + 1}` });
    const seed = h("input", { id: "world-seed", maxlength: "40", placeholder: "Leave empty for random" });
    let mode = "survival";
    const modeBtn = (m, label, text) =>
      h(
        `button.mode${mode === m ? ".on" : ""}`,
        {
          type: "button",
          "aria-pressed": mode === m ? "true" : "false",
          onclick: (e) => {
            mode = m;
            for (const b of e.currentTarget.parentElement.children) {
              const on = b === e.currentTarget;
              b.classList.toggle("on", on);
              b.setAttribute("aria-pressed", on ? "true" : "false");
            }
          },
        },
        h("strong", {}, label),
        h("span", {}, text),
      );
    app.replaceChildren(
      h(
        "main.menu",
        {},
        h("h1.logo", {}, "THE GAME"),
        h("p.tagline", {}, "Dig. Build. Craft. Survive the night."),
        h(
          "form.panel.new-world",
          {
            onsubmit: (e) => {
              e.preventDefault();
              const id = `w${Date.now().toString(36)}`;
              const world = G.newWorld({ id, name: name.value.trim() || "My world", mode, seedText: seed.value.trim() });
              persist(world);
              play(world);
            },
          },
          h("h2", {}, "New world"),
          h("label", { for: "world-name" }, "Name"),
          name,
          h("div.modes", {}, modeBtn("survival", "⚔️ Survival", "Health, hunger, crafting, creatures at night"), modeBtn("creative", "🎨 Creative", "Every block, fly, just build")),
          h("label", { for: "world-seed" }, "Seed (same seed = same world)"),
          seed,
          h("button.btn", { type: "submit" }, "Create & play"),
        ),
        worlds.length ? h("h2", {}, "Your worlds") : null,
        h(
          "ul.worlds",
          {},
          worlds.map((w) =>
            h(
              "li.panel",
              {},
              h("div", { style: "flex:1;min-width:0" }, h("strong", {}, w.name), h("div.muted", {}, `${w.mode === "creative" ? "🎨 Creative" : "⚔️ Survival"} · played ${new Date(w.played).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`)),
              h(
                "button.btn.small",
                {
                  onclick: () => {
                    try {
                      play(G.loadWorld(JSON.parse(read(WORLD_KEY(w.id)))));
                    } catch {
                      toast("That world couldn't be opened.");
                    }
                  },
                },
                "Play",
              ),
              h(
                "button.btn.small.ghost",
                {
                  "aria-label": `Delete ${w.name}`,
                  onclick: () => {
                    if (!confirm(`Delete "${w.name}" forever?`)) return;
                    remove(WORLD_KEY(w.id));
                    saveIndex(listWorlds().filter((x) => x.id !== w.id));
                    menu();
                  },
                },
                "🗑",
              ),
            ),
          ),
        ),
        h("p.muted.help", {}, "Computer: A/D or ←/→ to walk, W/Space to jump, click to mine, right-click to build, 1–8 for your hotbar, E for your bag. Phone: use the buttons, and switch between ⛏ Mine and 🧱 Build."),
        h("footer", {}, "Made by Logan · ", h("a", { href: "/logans-games" }, "More games")),
      ),
    );
  }

  /* ---------------------------------------------------------------- */
  /* Playing a world                                                   */
  /* ---------------------------------------------------------------- */

  const PW = 0.7; // player width (blocks)
  const PH = 1.8; // player height
  const REACH = 5;

  function play(world) {
    stop();
    const creative = world.mode === "creative";
    const W = world.w, H = world.h, T = world.tiles;
    const p = { ...world.player, vx: 0, vy: 0, onGround: false, fallFrom: null, hurtT: 0, hurtClock: 0 };
    let inv = world.inventory;
    if (creative && inv.every((s) => !s)) inv = G.CREATIVE_BLOCKS.slice(0, G.HOTBAR).map((k) => ({ id: k, n: 1 })).concat(Array(G.SLOTS - G.HOTBAR).fill(null));
    let selected = p.selected || 0;
    let action = "mine"; // touch mode
    let time = world.time;
    const creatures = [];
    const floaters = [];
    let mining = null; // { tx, ty, t, need }
    let pointer = null; // { x, y, button, down }
    let paused = false, raf = 0, last = performance.now(), saveT = 15, spawnT = 3;
    const keys = {};

    const tile = (x, y) => (x < 0 || x >= W || y < 0 ? 0 : y >= H ? 16 : T[y * W + x]);
    const setTile = (x, y, id) => {
      if (x < 0 || x >= W || y < 0 || y >= H) return;
      T[y * W + x] = id;
      tops[x] = topOf(x);
    };
    const solid = (x, y) => (x < 0 || x >= W ? true : G.blockById(tile(x, y)).solid);
    const topOf = (x) => {
      for (let y = 0; y < H; y++) if (G.blockById(T[y * W + x]).solid) return y;
      return H;
    };
    const tops = Array.from({ length: W }, (_, x) => topOf(x));

    // Layout
    const canvas = h("canvas.world", { "aria-label": `${world.name}, a block world` });
    const hud = h("div.hud", {});
    const hotbar = h("div.hotbar", { role: "toolbar", "aria-label": "Hotbar" });
    const hold = (label, text, key) =>
      h(
        "button.pad",
        {
          "aria-label": label,
          onpointerdown: (e) => (e.preventDefault(), (keys[key] = true)),
          onpointerup: () => (keys[key] = false),
          onpointerleave: () => (keys[key] = false),
          onpointercancel: () => (keys[key] = false),
          oncontextmenu: (e) => e.preventDefault(),
        },
        text,
      );
    const actionBtn = h("button.pad.action", { "aria-label": "Switch between mining and building", onclick: () => setAction(action === "mine" ? "build" : "mine") }, "⛏ Mine");
    const eatBtn = h("button.pad.eat", { "aria-label": "Eat", onclick: () => eatSelected(), hidden: true }, "🍖 Eat");
    const controls = h(
      "div.controls",
      {},
      h("div.dpad", {}, hold("Walk left", "◀", "left"), hold("Walk right", "▶", "right")),
      h("div.dpad", {}, actionBtn, eatBtn),
      h("div.dpad", {}, creative ? hold("Fly down", "⤓", "down") : null, hold(creative ? "Jump or fly up" : "Jump", "⤒", "jump")),
    );
    const top = h(
      "header.bar",
      {},
      h("button.icon-btn", { "aria-label": "Save and quit", onclick: () => quit() }, "🏠"),
      h("strong.title", {}, world.name),
      h("span.clock", {}, ""),
      h("button.icon-btn", { "aria-label": "Open bag and crafting", onclick: () => openBag() }, "🎒"),
      h(
        "button.icon-btn",
        {
          "aria-label": muted ? "Turn sound on" : "Turn sound off",
          onclick: (e) => {
            muted = !muted;
            write(MUTE_KEY, muted ? "1" : "0");
            e.currentTarget.textContent = muted ? "🔇" : "🔊";
          },
        },
        muted ? "🔇" : "🔊",
      ),
    );
    app.replaceChildren(h("main.play", {}, top, h("div.view", {}, canvas, hud), hotbar, controls));
    const clockEl = top.querySelector(".clock");
    const g = canvas.getContext("2d");
    let TILE = 28, dpr = 1, vw = 0, vh = 0;
    function size() {
      dpr = window.devicePixelRatio || 1;
      const r = canvas.parentElement.getBoundingClientRect();
      vw = r.width;
      vh = r.height;
      canvas.width = Math.round(vw * dpr);
      canvas.height = Math.round(vh * dpr);
      canvas.style.width = `${vw}px`;
      canvas.style.height = `${vh}px`;
      TILE = vw < 500 ? 26 : 30;
    }
    size();
    window.addEventListener("resize", size);

    function setAction(a) {
      action = a;
      actionBtn.textContent = a === "mine" ? "⛏ Mine" : "🧱 Build";
      actionBtn.classList.toggle("building", a === "build");
    }

    /* Hotbar */
    function drawHotbar() {
      hotbar.replaceChildren(
        ...inv.slice(0, G.HOTBAR).map((s, i) =>
          h(
            `button.slot${i === selected ? ".on" : ""}`,
            { "aria-label": s ? `${G.itemName(s.id)}${creative ? "" : `, ${s.n}`}` : "Empty slot", "aria-pressed": i === selected ? "true" : "false", onclick: () => select(i) },
            s ? itemIcon(s.id) : null,
            s && !creative && s.n > 1 ? h("span.n", {}, s.n) : null,
          ),
        ),
      );
      const held = inv[selected];
      eatBtn.hidden = !(held && G.ITEMS[held.id] && G.ITEMS[held.id].food) || creative;
    }
    function select(i) {
      selected = (i + G.HOTBAR) % G.HOTBAR;
      mining = null;
      drawHotbar();
    }
    /** A small picture of an item: its block colors, or its emoji. */
    function itemIcon(key) {
      const item = G.ITEMS[key] || {};
      const b = item.block !== undefined ? G.blockById(item.block) : key === "water" ? G.BLOCK.water : key === "lava" ? G.BLOCK.lava : null;
      if (b) return h("span.block-icon", { style: `--c:${b.color};--s:${b.spots || b.top || b.color}`, "data-key": b.key });
      return h("span.emoji", {}, item.emoji || "❔");
    }
    drawHotbar();

    /* Input */
    const kd = (e) => {
      if (document.querySelector(".overlay")) return;
      const k = e.key.toLowerCase();
      if (k === "a" || k === "arrowleft") keys.left = true;
      else if (k === "d" || k === "arrowright") keys.right = true;
      else if (k === "w" || k === "arrowup" || k === " ") keys.jump = true;
      else if (k === "s" || k === "arrowdown") keys.down = true;
      else if (k >= "1" && k <= "8") select(Number(k) - 1);
      else if (k === "e" || k === "i") openBag();
      else if (k === "f") eatSelected();
      else return;
      e.preventDefault();
    };
    const ku = (e) => {
      const k = e.key.toLowerCase();
      if (k === "a" || k === "arrowleft") keys.left = false;
      else if (k === "d" || k === "arrowright") keys.right = false;
      else if (k === "w" || k === "arrowup" || k === " ") keys.jump = false;
      else if (k === "s" || k === "arrowdown") keys.down = false;
    };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        select(selected + Math.sign(e.deltaY));
      },
      { passive: false },
    );
    const toWorld = (cx, cy) => {
      const r = canvas.getBoundingClientRect();
      return { x: (cx - r.left - vw / 2) / TILE + camX, y: (cy - r.top - vh / 2) / TILE + camY };
    };
    canvas.addEventListener("pointerdown", (e) => {
      canvas.setPointerCapture(e.pointerId);
      pointer = { ...toWorld(e.clientX, e.clientY), button: e.pointerType === "mouse" ? e.button : -1, down: true };
      // Tap a creature to hit it.
      const c = creatureAt(pointer.x, pointer.y);
      if (c) return attack(c);
      const placing = pointer.button === 2 || (pointer.button === -1 && action === "build");
      if (placing) {
        place(Math.floor(pointer.x), Math.floor(pointer.y));
        pointer.down = false;
      }
    });
    canvas.addEventListener("pointermove", (e) => pointer && Object.assign(pointer, toWorld(e.clientX, e.clientY)));
    const up = () => {
      pointer = null;
      mining = null;
    };
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);

    const inReach = (x, y) => Math.hypot(x + 0.5 - p.x, y + 0.5 - (p.y - PH / 2)) <= REACH;
    const nearStations = () => {
      const found = new Set();
      const px = Math.floor(p.x), py = Math.floor(p.y - 1);
      for (let y = py - 4; y <= py + 4; y++) for (let x = px - 4; x <= px + 4; x++) {
        const id = tile(x, y);
        if (id === G.BLOCK.workbench.id) found.add("workbench");
        if (id === G.BLOCK.furnace.id) found.add("furnace");
      }
      return [...found];
    };

    function float(text, x, y, color = "#fff") {
      floaters.push({ text, x, y, t: 1.2, color });
    }

    function place(tx, ty) {
      if (!inReach(tx, ty)) return;
      const held = inv[selected];
      if (!held) return;
      const item = G.ITEMS[held.id];
      const blockId = item && item.block !== undefined ? item.block : held.id === "water" ? G.BLOCK.water.id : held.id === "lava" ? G.BLOCK.lava.id : null;
      if (blockId === null) {
        if (item && item.food && !creative) eatSelected();
        else if (item && item.armor) wear(held.id);
        return;
      }
      const here = G.blockById(tile(tx, ty));
      if (here.solid || (here.id && !here.liquid)) return;
      // Needs something next to it to stick to.
      const touching = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => tile(tx + dx, ty + dy) !== 0);
      if (!touching) return;
      const b = G.blockById(blockId);
      if (b.solid) {
        if (overlaps(tx, ty, p.x - PW / 2, p.y - PH, PW, PH)) return;
        if (creatures.some((c) => overlaps(tx, ty, c.x - c.w / 2, c.y - c.h, c.w, c.h))) return;
      }
      setTile(tx, ty, blockId);
      sounds.place();
      if (!creative) {
        takeSelected();
        drawHotbar();
      }
    }
    const overlaps = (tx, ty, x, y, w, hh) => x < tx + 1 && x + w > tx && y < ty + 1 && y + hh > ty;

    function updateMining(dt) {
      if (!pointer || !pointer.down) return;
      const placing = pointer.button === 2 || (pointer.button === -1 && action === "build");
      if (placing) return;
      const tx = Math.floor(pointer.x), ty = Math.floor(pointer.y);
      if (!inReach(tx, ty) || tile(tx, ty) === 0 || G.blockById(tile(tx, ty)).liquid) {
        mining = null;
        return;
      }
      const held = inv[selected] ? inv[selected].id : null;
      if (!mining || mining.tx !== tx || mining.ty !== ty) mining = { tx, ty, t: 0, need: G.mineTime(tile(tx, ty), held, creative) };
      if (mining.need === Infinity) return;
      mining.t += dt;
      if (Math.random() < dt * 8) sounds.dig();
      if (mining.t >= mining.need) {
        const id = tile(tx, ty);
        setTile(tx, ty, 0);
        mining = null;
        sounds.pop();
        if (!creative) {
          const drop = G.dropOf(id, held);
          if (drop) {
            const res = G.addItem(inv, drop, 1);
            inv = res.inv;
            float(res.left ? "Bag full!" : `+1 ${G.itemName(drop)}`, tx + 0.5, ty, res.left ? "#ff8a8a" : "#fff");
            drawHotbar();
          } else if (G.blockById(id).tier) float("Needs a better pickaxe", tx + 0.5, ty, "#ffcf3d");
        }
        // Things resting on a broken block (cactus, torches) fall too.
        const above = tile(tx, ty - 1);
        if (above === G.BLOCK.torch.id || above === G.BLOCK.cactus.id) setTile(tx, ty - 1, 0);
      }
    }

    /** Use up one of whatever is in the selected hotbar slot. */
    function takeSelected() {
      const slot = inv[selected];
      if (!slot) return;
      inv = [...inv];
      inv[selected] = slot.n > 1 ? { ...slot, n: slot.n - 1 } : null;
    }

    function eatSelected() {
      const held = inv[selected];
      if (creative || !held || !G.ITEMS[held.id] || !G.ITEMS[held.id].food) return;
      if (p.hunger >= G.MAX_HUNGER) return toast("You're full!");
      Object.assign(p, G.eat(p, held.id));
      takeSelected();
      sounds.eat();
      float(`Yum! ${G.ITEMS[held.id].emoji}`, p.x, p.y - PH - 0.5);
      drawHotbar();
    }
    function wear(key) {
      const prev = p.armor;
      inv = G.removeItem(inv, key, 1) || inv;
      if (prev) inv = G.addItem(inv, prev, 1).inv;
      p.armor = key;
      sounds.craft();
      toast(`Wearing ${G.itemName(key)}`);
      drawHotbar();
    }

    function hurt(amount, from) {
      if (creative || p.hurtT > 0 || p.health <= 0) return;
      const dmg = G.hurtBy(amount, p.armor);
      p.health = Math.max(0, p.health - dmg);
      p.hurtT = 0.7;
      sounds.hurt();
      if (from !== undefined) {
        p.vx = Math.sign(p.x - from) * 6;
        p.vy = -5;
      }
      if (navigator.vibrate) navigator.vibrate(60);
      if (p.health <= 0) faint();
    }
    function faint() {
      paused = true;
      const o = h(
        "div.overlay",
        { role: "dialog", "aria-label": "You fainted" },
        h(
          "div.panel.dialog",
          {},
          h("div", { style: "font-size:52px" }, "😵"),
          h("h2", {}, "You fainted!"),
          h("p", {}, "Don't worry: you keep your stuff. You'll wake up back at the start."),
          h(
            "button.btn",
            {
              onclick: () => {
                o.remove();
                Object.assign(p, { x: world.spawn.x, y: world.spawn.y, vx: 0, vy: 0, health: G.MAX_HEALTH, hunger: Math.max(p.hunger, 12), fallFrom: null, hurtT: 1 });
                creatures.length = 0;
                paused = false;
              },
            },
            "Wake up",
          ),
        ),
      );
      document.body.append(o);
    }

    /* Creatures */
    function creatureAt(x, y) {
      return creatures.find((c) => x >= c.x - c.w / 2 - 0.2 && x <= c.x + c.w / 2 + 0.2 && y >= c.y - c.h - 0.2 && y <= c.y + 0.2 && Math.hypot(c.x - p.x, c.y - p.y) <= REACH);
    }
    function attack(c) {
      const held = inv[selected] ? G.ITEMS[inv[selected].id] : null;
      const dmg = held && held.damage ? held.damage : 1;
      c.hp -= dmg;
      c.hurtT = 0.3;
      c.vx = Math.sign(c.x - p.x) * 7;
      c.vy = -5;
      sounds.hit();
      if (c.hp <= 0) {
        c.dead = true;
        const info = G.CREATURES[c.type];
        float(`${info.emoji} 💨`, c.x, c.y - 1);
        if (!creative && info.drop) {
          inv = G.addItem(inv, info.drop, 1).inv;
          float(`+1 ${G.itemName(info.drop)}`, c.x, c.y - 1.6);
          drawHotbar();
        }
      }
    }
    function spawnCreatures() {
      const night = G.isNight(time);
      const monsters = creatures.filter((c) => !G.CREATURES[c.type].friendly).length;
      const animals = creatures.length - monsters;
      const ring = () => Math.floor(p.x + (Math.random() < 0.5 ? -1 : 1) * (14 + Math.random() * 12));
      const x = Math.max(1, Math.min(W - 2, ring()));
      const underground = p.y > tops[Math.floor(p.x)] + 6;
      if (!creative && monsters < 4 && (night || underground)) {
        const types = ["gloomer", "snapper", "spookle"];
        const type = types[Math.floor(Math.random() * types.length)];
        let y = tops[x];
        if (underground) {
          // Find a dark open spot near your depth.
          y = null;
          for (let dy = -6; dy <= 6; dy++) {
            const yy = Math.floor(p.y) + dy;
            if (!solid(x, yy) && !solid(x, yy - 1) && solid(x, yy + 1) && yy > tops[x] + 4) {
              y = yy + 1;
              break;
            }
          }
        }
        if (y !== null && y < H) creatures.push(makeCreature(type, x + 0.5, y));
      } else if (!night && animals < 4 && Math.random() < 0.5) {
        const y = tops[x];
        if (tile(x, y) === G.BLOCK.grass.id) creatures.push(makeCreature(Math.random() < 0.5 ? "puffhop" : "boinkle", x + 0.5, y));
      }
    }
    const makeCreature = (type, x, y) => ({ type, x, y, vx: 0, vy: 0, w: 0.9, h: 0.9, hp: G.CREATURES[type].hp, dir: 1, thinkT: 0, hurtT: 0, hitT: 0 });

    function updateCreatures(dt) {
      const day = !G.isNight(time);
      for (const c of creatures) {
        const info = G.CREATURES[c.type];
        c.hurtT = Math.max(0, c.hurtT - dt);
        c.hitT = Math.max(0, c.hitT - dt);
        const dx = p.x - c.x;
        const far = Math.abs(dx) > 45 || Math.abs(p.y - c.y) > 40;
        // Night creatures on the surface vanish in daylight.
        if (far || (info.night && day && c.y <= tops[Math.floor(c.x)] + 1)) {
          c.dead = true;
          continue;
        }
        if ((c.thinkT -= dt) <= 0) {
          c.thinkT = 0.6 + Math.random();
          if (info.friendly) c.dir = Math.random() < 0.4 ? 0 : Math.random() < 0.5 ? -1 : 1;
          else c.dir = Math.abs(dx) < 22 ? Math.sign(dx) : 0;
        }
        if (info.flies) {
          c.x += Math.sign(dx) * info.speed * dt;
          c.y += Math.sign(p.y - 0.8 - c.y) * info.speed * 0.7 * dt;
        } else {
          if (c.hurtT <= 0) c.vx = c.dir * info.speed;
          const blocked = solid(Math.floor(c.x + c.dir * 0.6), Math.floor(c.y - 0.5));
          if (c.onGround && (blocked || (info.jumper && Math.random() < dt * 0.8))) c.vy = -9;
          moveBody(c, dt, 30);
        }
        // Touching you hurts (monsters only).
        if (!info.friendly && c.hitT <= 0 && Math.abs(dx) < (PW + c.w) / 2 && c.y > p.y - PH - 0.2 && c.y - c.h < p.y) {
          c.hitT = 1;
          hurt(info.damage, c.x);
        }
      }
      for (let i = creatures.length - 1; i >= 0; i--) if (creatures[i].dead) creatures.splice(i, 1);
    }

    /** Move a body with gravity and block collisions. Body x = middle, y = feet. */
    function moveBody(b, dt, gravity, wv = 0) {
      const w = b === p ? PW : b.w, hh = b === p ? PH : b.h;
      b.vy = Math.min(b.vy + gravity * dt, 22);
      // Horizontal
      b.x += (b.vx + wv) * dt;
      const hit = (x, y) => solid(Math.floor(x), Math.floor(y));
      for (const yy of [b.y - 0.05, b.y - hh / 2, b.y - hh + 0.05]) {
        if (hit(b.x + w / 2, yy)) b.x = Math.floor(b.x + w / 2) - w / 2 - 0.001;
        if (hit(b.x - w / 2, yy)) b.x = Math.floor(b.x - w / 2) + 1 + w / 2 + 0.001;
      }
      b.x = Math.max(w / 2, Math.min(W - w / 2, b.x));
      // Vertical
      b.y += b.vy * dt;
      b.onGround = false;
      for (const xx of [b.x - w / 2 + 0.05, b.x + w / 2 - 0.05]) {
        if (b.vy >= 0 && hit(xx, b.y)) {
          b.y = Math.floor(b.y);
          b.vy = 0;
          b.onGround = true;
        }
        if (b.vy < 0 && hit(xx, b.y - hh)) {
          b.y = Math.floor(b.y - hh) + 1 + hh;
          b.vy = 0;
        }
      }
      b.y = Math.min(H - 1, b.y);
    }

    function updatePlayer(dt) {
      p.hurtT = Math.max(0, p.hurtT - dt);
      const feet = tile(Math.floor(p.x), Math.floor(p.y - 0.2));
      const body = tile(Math.floor(p.x), Math.floor(p.y - 1));
      const inWater = G.blockById(feet).liquid || G.blockById(body).liquid;
      const inLava = feet === G.BLOCK.lava.id || body === G.BLOCK.lava.id;
      const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
      const speed = creative ? 7 : inWater ? 2.6 : 5;
      if (p.hurtT <= 0.4) p.vx = dir * speed;
      else p.vx *= 0.9;
      if (creative) {
        // Fly: no falling, up and down with jump / down.
        p.vy = keys.jump ? -7 : keys.down ? 7 : 0;
        const gy = p.vy;
        moveBody(p, dt, 0);
        p.vy = gy;
      } else {
        if (keys.jump && inWater) p.vy = -4;
        else if (keys.jump && p.onGround) p.vy = -10.5;
        const wasGround = p.onGround;
        moveBody(p, dt, inWater ? 9 : 30);
        if (!p.onGround && wasGround) p.fallFrom = p.y;
        if (!p.onGround && p.fallFrom !== null) p.fallFrom = Math.min(p.fallFrom, p.y);
        if (inWater) p.fallFrom = null;
        if (p.onGround && p.fallFrom !== null) {
          const dmg = G.fallDamage(p.y - p.fallFrom);
          if (dmg) hurt(dmg);
          p.fallFrom = null;
        }
        if (inLava) hurt(G.BLOCK.lava.hurts);
        const touchingCactus = [[0.5, -0.5], [-0.5, -0.5], [0, 0.1]].some(([ox, oy]) => tile(Math.floor(p.x + ox * PW * 1.1), Math.floor(p.y + oy)) === G.BLOCK.cactus.id);
        if (touchingCactus) hurt(1);
        Object.assign(p, G.tickBody(p, dt, dir !== 0));
        if (p.health <= 0 && !paused) faint();
      }
    }

    /* Drawing */
    let camX = p.x, camY = p.y - PH / 2;
    const hashXY = (x, y) => {
      let n = (x * 374761393 + y * 668265263) | 0;
      n = Math.imul(n ^ (n >>> 13), 1274126177);
      return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
    };

    function lightAt(x, y, day, sources) {
      const top = tops[Math.max(0, Math.min(W - 1, x))];
      let sky = y < top ? day : day * Math.max(0, 1 - (y - top) * 0.12);
      let best = sky;
      for (const s of sources) {
        const d = Math.abs(s.x - x) + Math.abs(s.y - y);
        if (d < s.l) best = Math.max(best, (s.l - d) / s.l);
      }
      return Math.min(1, Math.max(creative ? 0.45 : 0.04, best));
    }

    function drawTile(id, sx, sy, s, x, y) {
      const b = G.blockById(id);
      g.fillStyle = b.color;
      if (b.key === "glass") {
        g.globalAlpha = 0.25;
        g.fillRect(sx, sy, s, s);
        g.globalAlpha = 1;
        g.strokeStyle = "#e8f8ff";
        g.lineWidth = 2;
        g.strokeRect(sx + 1, sy + 1, s - 2, s - 2);
        g.fillStyle = "#ffffff88";
        g.fillRect(sx + s * 0.2, sy + s * 0.2, s * 0.1, s * 0.4);
        return;
      }
      if (b.key === "water") {
        g.globalAlpha = 0.65;
        g.fillRect(sx, sy, s, s);
        g.globalAlpha = 1;
        return;
      }
      if (b.key === "torch") {
        g.fillStyle = "#7a4f2a";
        g.fillRect(sx + s * 0.44, sy + s * 0.35, s * 0.12, s * 0.65);
        g.fillStyle = "#ffcf3d";
        g.beginPath();
        g.arc(sx + s / 2, sy + s * 0.3, s * 0.14, 0, Math.PI * 2);
        g.fill();
        return;
      }
      g.fillRect(sx, sy, s, s);
      const r = hashXY(x, y);
      switch (b.key) {
        case "grass":
          if (tile(x, y - 1) === 0) {
            g.fillStyle = b.top;
            g.fillRect(sx, sy, s, s * 0.25);
          }
          break;
        case "log":
          g.fillStyle = "#5e3b1e";
          g.fillRect(sx + s * 0.25, sy, s * 0.08, s);
          g.fillRect(sx + s * 0.65, sy, s * 0.08, s);
          break;
        case "planks":
        case "workbench":
          g.fillStyle = "#00000022";
          g.fillRect(sx, sy + s * 0.48, s, s * 0.06);
          if (b.key === "workbench") {
            g.fillStyle = "#5e3b1e";
            g.fillRect(sx, sy, s, s * 0.22);
            g.fillStyle = "#c0c4cc";
            g.fillRect(sx + s * 0.15, sy + s * 0.3, s * 0.3, s * 0.08);
            g.fillRect(sx + s * 0.6, sy + s * 0.28, s * 0.08, s * 0.3);
          }
          break;
        case "leaves":
        case "snowy_leaves":
          g.fillStyle = "#00000022";
          for (let i = 0; i < 4; i++) g.fillRect(sx + ((r * 97 * (i + 1)) % 1) * s * 0.8, sy + ((r * 57 * (i + 2)) % 1) * s * 0.8, s * 0.18, s * 0.18);
          break;
        case "coal_ore":
        case "iron_ore":
        case "gold_ore":
        case "gem_ore":
          g.fillStyle = b.spots;
          for (let i = 0; i < 4; i++) g.fillRect(sx + ((r * 31 * (i + 1)) % 0.75) * s + s * 0.05, sy + ((r * 71 * (i + 3)) % 0.75) * s + s * 0.05, s * 0.2, s * 0.2);
          break;
        case "stone":
        case "cobble":
          g.fillStyle = "#00000018";
          g.fillRect(sx + r * s * 0.6, sy + ((r * 13) % 1) * s * 0.7, s * 0.3, s * 0.16);
          if (b.key === "cobble") g.fillRect(sx + ((r * 7) % 1) * s * 0.5, sy + ((r * 3) % 1) * s * 0.6, s * 0.35, s * 0.18);
          break;
        case "bricks":
          g.fillStyle = "#00000030";
          g.fillRect(sx, sy + s * 0.48, s, s * 0.05);
          g.fillRect(sx + s * 0.5, sy, s * 0.05, s * 0.48);
          g.fillRect(sx + s * 0.2, sy + s * 0.5, s * 0.05, s * 0.5);
          break;
        case "furnace":
          g.fillStyle = "#222";
          g.fillRect(sx + s * 0.25, sy + s * 0.45, s * 0.5, s * 0.35);
          g.fillStyle = "#ff8a3d";
          g.fillRect(sx + s * 0.3, sy + s * 0.62, s * 0.4, s * 0.12);
          break;
        case "cactus":
          g.fillStyle = "#2b7a2a";
          g.fillRect(sx + s * 0.3, sy, s * 0.06, s);
          g.fillRect(sx + s * 0.64, sy, s * 0.06, s);
          break;
        case "lava":
          g.fillStyle = "#ffd23f";
          g.fillRect(sx + ((r + performance.now() / 4000) % 1) * s * 0.7, sy + s * 0.3, s * 0.25, s * 0.12);
          break;
        case "ice":
          g.fillStyle = "#ffffff66";
          g.fillRect(sx + s * 0.15, sy + s * 0.15, s * 0.5, s * 0.08);
          break;
        case "bedrock":
          g.fillStyle = "#000";
          g.fillRect(sx + r * s * 0.6, sy + ((r * 9) % 1) * s * 0.6, s * 0.35, s * 0.35);
          break;
        default:
      }
    }

    function draw() {
      const s = TILE;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const day = G.daylight(time);
      // Sky
      const skyTop = `rgb(${Math.round(20 + 90 * day)},${Math.round(24 + 150 * day)},${Math.round(60 + 190 * day)})`;
      const grad = g.createLinearGradient(0, 0, 0, vh);
      grad.addColorStop(0, skyTop);
      grad.addColorStop(1, `rgb(${Math.round(30 + 170 * day)},${Math.round(30 + 190 * day)},${Math.round(70 + 180 * day)})`);
      g.fillStyle = grad;
      g.fillRect(0, 0, vw, vh);
      // Sun or moon
      const phase = G.dayPhase(time);
      const arc = G.isNight(time) ? (phase - 0.6) / 0.4 : phase / 0.6;
      g.font = `${s * 1.6}px serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(G.isNight(time) ? "🌙" : "☀️", vw * (0.1 + arc * 0.8), vh * 0.12 + Math.sin(arc * Math.PI) * -vh * 0.06 + vh * 0.06);

      const x0 = Math.floor(camX - vw / 2 / s) - 1, x1 = Math.ceil(camX + vw / 2 / s) + 1;
      const y0 = Math.floor(camY - vh / 2 / s) - 1, y1 = Math.ceil(camY + vh / 2 / s) + 1;
      const ox = vw / 2 - camX * s, oy = vh / 2 - camY * s;
      // Light sources nearby (torches, lava, and a little glow around you).
      const sources = [{ x: Math.floor(p.x), y: Math.floor(p.y - 1), l: 4 }];
      for (let y = y0 - 7; y <= y1 + 7; y++) for (let x = x0 - 7; x <= x1 + 7; x++) {
        const b = G.blockById(tile(x, y));
        if (b.light) sources.push({ x, y, l: b.light });
      }
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const id = tile(x, y);
          const sx = Math.round(ox + x * s), sy = Math.round(oy + y * s);
          // Exact sizes so shadows never overlap (overlaps showed as grid lines).
          const tw = Math.round(ox + (x + 1) * s) - sx, th = Math.round(oy + (y + 1) * s) - sy;
          const light = lightAt(x, y, day, sources);
          if (id) drawTile(id, sx, sy, Math.max(tw, th), x, y);
          // Darkness: underground and at night, unless lit.
          const dark = id || y >= tops[Math.max(0, Math.min(W - 1, x))] ? 1 - light : (1 - light) * 0.4;
          if (dark > 0.02) {
            g.fillStyle = `rgba(4,6,16,${dark})`;
            g.fillRect(sx, sy, tw, th);
          }
        }
      }
      // Mining cracks and the block you're aiming at
      if (mining && mining.need < Infinity) {
        const sx = ox + mining.tx * s, sy = oy + mining.ty * s;
        g.strokeStyle = "#000a";
        g.lineWidth = 2;
        const k = Math.min(1, mining.t / mining.need);
        g.beginPath();
        for (let i = 0; i < Math.ceil(k * 5); i++) {
          g.moveTo(sx + s / 2, sy + s / 2);
          g.lineTo(sx + s / 2 + Math.cos(i * 1.3) * s * 0.45 * k, sy + s / 2 + Math.sin(i * 1.3) * s * 0.45 * k);
        }
        g.stroke();
      }
      if (pointer) {
        const tx = Math.floor(pointer.x), ty = Math.floor(pointer.y);
        if (inReach(tx, ty)) {
          g.strokeStyle = "#ffffffcc";
          g.lineWidth = 2;
          g.strokeRect(ox + tx * s + 1, oy + ty * s + 1, s - 2, s - 2);
        }
      }
      // Creatures
      g.font = `${s * 1.05}px serif`;
      g.textBaseline = "bottom";
      for (const c of creatures) {
        const info = G.CREATURES[c.type];
        g.globalAlpha = c.hurtT > 0 ? 0.5 : info.flies ? 0.8 : 1;
        g.save();
        g.translate(ox + c.x * s, oy + c.y * s + 2);
        if (c.dir > 0 && !info.flies) g.scale(-1, 1);
        g.fillText(info.emoji, 0, 0);
        g.restore();
        if (!info.friendly && G.isNight(time)) {
          g.fillStyle = "#ff3d3d";
          g.fillRect(ox + c.x * s - 3, oy + (c.y - c.h) * s - 6, 6, 3);
        }
      }
      g.globalAlpha = 1;
      // You
      drawPlayer(ox + p.x * s, oy + p.y * s, s);
      // Floating texts
      g.font = "bold 13px system-ui";
      g.textBaseline = "middle";
      for (const f of floaters) {
        g.globalAlpha = Math.min(1, f.t);
        g.fillStyle = "#000a";
        g.fillText(f.text, ox + f.x * s + 1, oy + f.y * s + 1);
        g.fillStyle = f.color;
        g.fillText(f.text, ox + f.x * s, oy + f.y * s);
      }
      g.globalAlpha = 1;
    }

    function drawPlayer(cx, by, s) {
      const blink = p.hurtT > 0 && Math.floor(p.hurtT * 12) % 2;
      g.globalAlpha = blink ? 0.4 : 1;
      const w = PW * s, hh = PH * s;
      const facing = keys.left ? -1 : 1;
      // Legs
      g.fillStyle = "#2f3e8a";
      const step = Math.abs(p.vx) > 0.1 && p.onGround ? Math.sin(performance.now() / 90) * s * 0.1 : 0;
      g.fillRect(cx - w * 0.4, by - hh * 0.38, w * 0.34, hh * 0.38 + step);
      g.fillRect(cx + w * 0.06, by - hh * 0.38, w * 0.34, hh * 0.38 - step);
      // Body (armor changes its color)
      g.fillStyle = p.armor === "gem_armor" ? "#3fd2e8" : p.armor === "iron_armor" ? "#c9ced8" : "#ff7a3d";
      g.fillRect(cx - w / 2, by - hh * 0.72, w, hh * 0.36);
      // Head
      g.fillStyle = "#f2c08a";
      g.fillRect(cx - w * 0.42, by - hh, w * 0.84, hh * 0.3);
      g.fillStyle = "#5a3a1e";
      g.fillRect(cx - w * 0.42, by - hh, w * 0.84, hh * 0.08);
      g.fillStyle = "#1d1d22";
      g.fillRect(cx + facing * w * 0.14 - 2, by - hh * 0.86, 4, 4);
      // Held item
      const held = inv[selected];
      if (held) {
        const item = G.ITEMS[held.id] || {};
        g.font = `${s * 0.55}px serif`;
        g.textBaseline = "middle";
        if (item.emoji) g.fillText(item.emoji, cx + facing * w * 0.75, by - hh * 0.52);
        else {
          const b = item.block !== undefined ? G.blockById(item.block) : null;
          if (b) {
            g.fillStyle = b.color;
            g.fillRect(cx + facing * w * 0.6 - s * 0.15, by - hh * 0.6, s * 0.3, s * 0.3);
          }
        }
      }
      g.globalAlpha = 1;
    }

    function drawHud() {
      if (creative) {
        hud.replaceChildren(h("span.badge", {}, "🎨 Creative: fly with ⤒ / ⤓"));
        return;
      }
      const hearts = [];
      for (let i = 0; i < 10; i++) hearts.push(p.health >= (i + 1) * 2 ? "❤️" : p.health === i * 2 + 1 ? "💔" : "🖤");
      const food = [];
      for (let i = 0; i < 10; i++) food.push(p.hunger >= (i + 1) * 2 ? "🍗" : p.hunger === i * 2 + 1 ? "🦴" : "▫️");
      const rows = [
        h("span.bar-row", { "aria-label": `Health ${p.health / 2} of 10` }, hearts.join("")),
        h("span.bar-row", { "aria-label": `Food ${p.hunger / 2} of 10` }, food.join("")),
      ];
      if (p.armor) rows.push(h("span.badge", {}, `${G.ITEMS[p.armor].emoji} ${G.itemName(p.armor)}`));
      hud.replaceChildren(...rows);
    }
    let hudT = 0;

    /* Bag and crafting */
    function openBag() {
      if (document.querySelector(".overlay")) return;
      paused = true;
      keys.left = keys.right = keys.jump = keys.down = false;
      const o = h("div.overlay", { role: "dialog", "aria-label": "Bag and crafting" });
      const close = () => {
        o.remove();
        paused = false;
        drawHotbar();
      };
      function render() {
        const near = nearStations();
        const slots = inv.map((s, i) =>
          h(
            `button.slot${i === selected ? ".on" : ""}${i < G.HOTBAR ? ".hot" : ""}`,
            {
              "aria-label": s ? `${G.itemName(s.id)}, ${s.n}` : "Empty slot",
              onclick: () => {
                if (i < G.HOTBAR) selected = i;
                else [inv[selected], inv[i]] = [inv[i], inv[selected]];
                inv = [...inv];
                render();
              },
            },
            s ? itemIcon(s.id) : null,
            s && s.n > 1 ? h("span.n", {}, s.n) : null,
          ),
        );
        const body = creative
          ? [
              h("h2", {}, "🎨 All blocks"),
              h("p.muted", {}, "Tap a block to put it in your selected hotbar slot."),
              h(
                "div.slots",
                {},
                G.CREATIVE_BLOCKS.map((k) =>
                  h(
                    "button.slot",
                    {
                      "aria-label": G.itemName(k) || k,
                      title: G.itemName(k),
                      onclick: () => {
                        inv[selected] = { id: k, n: 1 };
                        inv = [...inv];
                        render();
                      },
                    },
                    itemIcon(k),
                  ),
                ),
              ),
              h("h2", {}, "Hotbar"),
              h("div.slots", {}, slots.slice(0, G.HOTBAR)),
            ]
          : [
              h("h2", {}, "🎒 Your bag"),
              h("p.muted", {}, "Top row is your hotbar. Tap a hotbar slot to pick it, then tap any bag item to swap it in."),
              h("div.slots", {}, slots),
              p.armor ? h("p", {}, `Wearing: ${G.ITEMS[p.armor].emoji} ${G.itemName(p.armor)}`) : null,
              ...["iron_armor", "gem_armor"].filter((k) => G.count(inv, k) && p.armor !== k).map((k) => h("button.btn.small", { onclick: () => (wear(k), render()) }, `Wear ${G.itemName(k)}`)),
              h("h2", {}, "🔨 Crafting"),
              h("p.muted", {}, near.length ? `Near: ${near.map(G.itemName).join(", ")}` : "Some things need you to stand near a Workbench or Furnace."),
              h(
                "ul.recipes",
                {},
                G.RECIPES.map((r) => {
                  const problem = G.craftProblem(inv, r, near);
                  return h(
                    `li${problem ? ".cant" : ""}`,
                    {},
                    h("span.out", {}, itemIcon(r.out), h("strong", {}, `${r.n > 1 ? `${r.n} ` : ""}${G.itemName(r.out)}`)),
                    h("span.muted.need", {}, Object.entries(r.need).map(([k, n]) => `${n} ${G.itemName(k)}`).join(" + ") + (r.at ? ` · at ${G.itemName(r.at)}` : "")),
                    h(
                      "button.btn.small",
                      {
                        disabled: !!problem,
                        title: problem || "",
                        onclick: () => {
                          const res = G.craft(inv, r, near);
                          if (!res.ok) return toast(res.reason);
                          inv = res.inv;
                          sounds.craft();
                          toast(`Made ${r.n > 1 ? `${r.n} ` : ""}${G.itemName(r.out)}!`);
                          render();
                        },
                      },
                      "Make",
                    ),
                  );
                }),
              ),
            ];
        o.replaceChildren(h("div.panel.bag", {}, h("div.row", {}, h("h2", { style: "margin:0;flex:1" }, world.name), h("button.btn.small.ghost", { onclick: close }, "Close ✕")), ...body));
      }
      render();
      document.body.append(o);
    }

    /* Loop */
    function step(dt) {
      time += dt;
      updatePlayer(dt);
      updateMining(dt);
      updateCreatures(dt);
      if ((spawnT -= dt) <= 0) {
        spawnT = 2.5;
        spawnCreatures();
      }
      for (const f of floaters) {
        f.t -= dt;
        f.y -= 0.8 * dt;
      }
      for (let i = floaters.length - 1; i >= 0; i--) if (floaters[i].t <= 0) floaters.splice(i, 1);
      camX += (p.x - camX) * Math.min(1, dt * 8);
      camY += (p.y - PH / 2 - camY) * Math.min(1, dt * 8);
      if ((saveT -= dt) <= 0) {
        saveT = 15;
        save();
      }
      if ((hudT -= dt) <= 0) {
        hudT = 0.25;
        drawHud();
        const phase = G.dayPhase(time);
        clockEl.textContent = G.isNight(time) ? "🌙 Night" : phase < 0.05 ? "🌅 Sunrise" : phase > 0.52 ? "🌇 Sunset" : "☀️ Day";
      }
    }
    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!paused) step(dt);
      draw();
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    function save() {
      world.player = { x: p.x, y: p.y, health: p.health, hunger: p.hunger, armor: p.armor, selected };
      world.inventory = inv;
      world.time = time;
      return persist(world);
    }
    const onHide = () => {
      if (document.hidden) save();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", save);

    function quit() {
      save();
      menu();
    }
    stop = () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", size);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", save);
      document.querySelector(".overlay")?.remove();
    };

    if (DEBUG) {
      window.__theGame = {
        world,
        player: p,
        get inv() {
          return inv;
        },
        give: (key, n = 1) => {
          inv = G.addItem(inv, key, n).inv;
          drawHotbar();
        },
        setTime: (t) => (time = t),
        tile,
        creatures,
        camera: () => ({ x: camX, y: camY, tile: TILE, vw, vh }),
        save,
      };
    }
  }

  menu();
})();
