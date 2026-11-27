/* Monster Packs: screens and effects, by Logan. The rules live in logic.js. */
(function () {
  "use strict";
  const M = window.MonsterPacks;
  const SAVE_KEY = "logans-games:monster-packs";
  const MUTE_KEY = "logans-games:monster-packs:muted";
  const app = document.getElementById("app");

  /* ---------------------------------------------------------------- */
  /* State and saving (on this device)                                 */
  /* ---------------------------------------------------------------- */

  let state = M.loadState(read(SAVE_KEY));
  let muted = read(MUTE_KEY) === "1";
  let screen = "packs";
  const view = { series: "1", type: "all", tier: "all", show: "all", shiny: false };

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
  /* Little helpers                                                    */
  /* ---------------------------------------------------------------- */

  /** h("div.card.t3", { onclick }, child, …): tiny element builder. */
  function h(tag, props, ...children) {
    const [name, ...classes] = tag.split(".");
    const el = document.createElement(name || "div");
    if (classes.length) el.className = classes.join(" ");
    for (const [k, v] of Object.entries(props || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "html") el.innerHTML = v;
      else if (k === "style") el.style.cssText = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : String(c));
    return el;
  }
  const coins = (n) => M.formatCoins(n);

  function toast(text) {
    document.querySelector(".toast")?.remove();
    const t = h("div.toast", { role: "status" }, text);
    document.body.append(t);
    setTimeout(() => t.remove(), 2400);
  }

  function confetti(count = 40) {
    const bits = ["🎉", "✨", "🪙", "⭐", "💎", "🔥"];
    for (let i = 0; i < count; i++) {
      const c = h("div.confetti", { style: `left:${Math.random() * 100}vw;animation-duration:${2 + Math.random() * 2.5}s;animation-delay:${Math.random() * 0.8}s` }, bits[i % bits.length]);
      document.body.append(c);
      setTimeout(() => c.remove(), 5500);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Sounds (made on the fly, no files)                                */
  /* ---------------------------------------------------------------- */

  let audio = null;
  function tone(freq, start, length, type = "triangle", volume = 0.12) {
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
    tear: () => { for (let i = 0; i < 6; i++) tone(180 + Math.random() * 300, i * 0.03, 0.06, "sawtooth", 0.05); },
    flip: (tier) => tone(320 + tier * 90, 0, 0.18),
    big: (tier) => [0, 4, 7, 12, 16].forEach((st, i) => tone(330 * 2 ** ((st + tier) / 12), i * 0.08, 0.35, "square", 0.07)),
    coin: () => { tone(988, 0, 0.08, "square", 0.06); tone(1319, 0.08, 0.2, "square", 0.06); },
    hit: () => tone(140, 0, 0.12, "sawtooth", 0.08),
    win: () => [0, 4, 7, 12].forEach((st, i) => tone(523 * 2 ** (st / 12), i * 0.12, 0.3)),
    lose: () => [7, 4, 0].forEach((st, i) => tone(330 * 2 ** (st / 12), i * 0.15, 0.3)),
  };

  /* ---------------------------------------------------------------- */
  /* Card drawing (art is made from each card's shape numbers)         */
  /* ---------------------------------------------------------------- */

  const TYPE_HUE = { fire: 14, water: 205, leaf: 125, storm: 50, frost: 190, shadow: 270 };
  const TYPE_ICON = { fire: "🔥", water: "💧", leaf: "🍃", storm: "⚡", frost: "❄️", shadow: "🌑" };

  function artSvg(card) {
    const a = card.art;
    const hue = TYPE_HUE[card.type] + a.hue;
    const main = `hsl(${hue} 75% 55%)`;
    const dark = `hsl(${hue} 60% 30%)`;
    const light = `hsl(${hue} 90% 78%)`;
    const s = a.size;
    const cx = 50;
    const cy = 58;
    const bodies = [
      `<ellipse cx="${cx}" cy="${cy}" rx="${26 * s}" ry="${24 * s}" fill="${main}" stroke="${dark}" stroke-width="3"/>`,
      `<rect x="${cx - 24 * s}" y="${cy - 24 * s}" width="${48 * s}" height="${46 * s}" rx="14" fill="${main}" stroke="${dark}" stroke-width="3"/>`,
      `<ellipse cx="${cx}" cy="${cy}" rx="${21 * s}" ry="${28 * s}" fill="${main}" stroke="${dark}" stroke-width="3"/>`,
      `<path d="M${cx} ${cy - 28 * s} C ${cx + 30 * s} ${cy - 20 * s}, ${cx + 30 * s} ${cy + 24 * s}, ${cx} ${cy + 24 * s} C ${cx - 30 * s} ${cy + 24 * s}, ${cx - 30 * s} ${cy - 20 * s}, ${cx} ${cy - 28 * s} Z" fill="${main}" stroke="${dark}" stroke-width="3"/>`,
    ];
    const top = cy - 25 * s;
    let svg = "";
    if (a.wings) {
      svg += `<ellipse cx="${cx - 27 * s}" cy="${cy - 8}" rx="${16 * s}" ry="${9 * s}" transform="rotate(-25 ${cx - 27 * s} ${cy - 8})" fill="${light}" stroke="${dark}" stroke-width="2"/>`;
      svg += `<ellipse cx="${cx + 27 * s}" cy="${cy - 8}" rx="${16 * s}" ry="${9 * s}" transform="rotate(25 ${cx + 27 * s} ${cy - 8})" fill="${light}" stroke="${dark}" stroke-width="2"/>`;
    }
    if (a.horns === 1) {
      svg += `<path d="M${cx - 14} ${top + 6} L${cx - 20} ${top - 12} L${cx - 6} ${top + 2} Z" fill="${light}" stroke="${dark}" stroke-width="2"/>`;
      svg += `<path d="M${cx + 14} ${top + 6} L${cx + 20} ${top - 12} L${cx + 6} ${top + 2} Z" fill="${light}" stroke="${dark}" stroke-width="2"/>`;
    } else if (a.horns === 2) {
      svg += `<path d="M${cx - 6} ${top + 3} L${cx} ${top - 16} L${cx + 6} ${top + 3} Z" fill="${light}" stroke="${dark}" stroke-width="2"/>`;
    }
    if (a.spikes) {
      let d = `M${cx - 18} ${top + 6}`;
      for (let i = 0; i < 5; i++) d += ` L${cx - 14 + i * 7} ${top - 4} L${cx - 10 + i * 7} ${top + 5}`;
      svg += `<path d="${d}" fill="${dark}"/>`;
    }
    svg += bodies[a.body];
    svg += `<ellipse cx="${cx}" cy="${cy + 8}" rx="${12 * s}" ry="${9 * s}" fill="${light}" opacity="0.55"/>`;
    // Feet
    svg += `<ellipse cx="${cx - 12}" cy="${cy + 23 * s}" rx="7" ry="4" fill="${dark}"/><ellipse cx="${cx + 12}" cy="${cy + 23 * s}" rx="7" ry="4" fill="${dark}"/>`;
    // Eyes
    const eyeY = cy - 6 * s;
    const xs = a.eyes === 1 ? [cx] : a.eyes === 2 ? [cx - 9, cx + 9] : [cx - 12, cx, cx + 12];
    for (const x of xs) svg += `<circle cx="${x}" cy="${eyeY}" r="${a.eyes === 1 ? 8 : 5.5}" fill="#fff" stroke="${dark}" stroke-width="1.5"/><circle cx="${x + 1}" cy="${eyeY + 1}" r="${a.eyes === 1 ? 3.5 : 2.5}" fill="#111"/>`;
    // Mouth with a little fang
    svg += `<path d="M${cx - 8} ${cy + 6} Q ${cx} ${cy + 13} ${cx + 8} ${cy + 6}" fill="none" stroke="${dark}" stroke-width="2.5" stroke-linecap="round"/><path d="M${cx + 3} ${cy + 8} l2 5 l2 -5 Z" fill="#fff"/>`;
    return `<svg class="art" viewBox="0 0 100 100" role="img" aria-label="${card.name}">${svg}</svg>`;
  }

  /** A card. `missing` shows a dark silhouette; `count` shows how many you own. */
  function cardEl(card, opts = {}) {
    const el = h(
      `div.card.t${card.tier}${opts.small ? ".small" : ""}${opts.shiny ? ".shiny" : ""}${opts.missing ? ".missing" : ""}`,
      { "data-id": card.id },
      h("span.num", {}, `#${card.id}`),
      h("div.tier", {}, opts.missing ? "???" : `${M.TIERS[card.tier].name}${card.event ? " · 🎉 Event" : ""}${opts.shiny ? " ✨" : ""}`),
      h("div.name", {}, opts.missing ? "???" : card.name),
      h("div", { html: artSvg(card) }),
      opts.missing
        ? null
        : h("div.stats", {}, h("span", {}, `${TYPE_ICON[card.type]} ${M.TYPE_NAMES[card.type]}`), h("span", {}, `⚔️${card.power}`)),
      opts.count > 1 ? h("span.count", {}, `×${opts.count}`) : null,
    );
    return el;
  }

  /** A pack: a tier number, or "event" for the Weekend Event pack. */
  function packEl(tier, big) {
    const event = tier === "event";
    return h(
      `div.pack.${event ? "ev" : `t${tier}`}${big ? ".big" : ""}`,
      { style: event ? null : `--c: var(--t${tier})` },
      h("span.logo", {}, event ? "🎉" : "👾"),
      h("span.label", {}, `${packName(tier)} pack`),
    );
  }
  const packName = (tier) => (tier === "event" ? M.EVENT_PACK.name : M.TIERS[tier].name);

  /* ---------------------------------------------------------------- */
  /* Layout                                                            */
  /* ---------------------------------------------------------------- */

  function render() {
    app.replaceChildren(topBar(), tabs(), h("main", {}, screen === "packs" ? packsScreen() : screen === "index" ? indexScreen() : battleScreen()), footer());
  }

  function topBar() {
    return h(
      "header.top",
      {},
      h("h1", {}, h("a", { href: "/logans-games" }, "👾 Monster Packs")),
      h("span.pill.coins", { title: `${state.coins.toLocaleString()} coins` }, coins(state.coins)),
      h("span.pill", { title: "Different monsters collected (all series)" }, `📖 ${M.collectedCount(state, 0)}/${M.CARDS.length}`),
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
    const tab = (id, label) =>
      h("button.tab", { "aria-current": screen === id ? "page" : null, onclick: () => ((screen = id), render()) }, label);
    return h("nav.tabs", { "aria-label": "Game" }, tab("packs", "🎁 Packs"), tab("index", "📖 Index"), tab("battle", "⚔️ Battle"));
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
            if (confirm("Start over? This deletes your cards, coins and any packs you bought, on this device. Bought packs can't be brought back.")) {
              setState(M.newState());
              render();
            }
          },
        },
        "Reset game",
      ),
      " · ",
      h("a", { href: "/logans-games/terms" }, "Store terms"),
    );
  }

  /* ---------------------------------------------------------------- */
  /* Deals (real money, through Stripe)                                */
  /* ---------------------------------------------------------------- */

  const DEVICE_KEY = "logans-games:device";
  /** A random id for this device: bought packs are only given to the device that bought them. */
  function deviceId() {
    let id = read(DEVICE_KEY);
    if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
      id = crypto.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16));
      write(DEVICE_KEY, id);
    }
    return id;
  }
  /** Today's deals from the server: { open, offers }. Loaded once per visit. */
  let store = null;
  let adsShown = 0;
  async function loadStore() {
    try {
      const res = await fetch(`/api/logans-games/offers?device=${deviceId()}`);
      store = res.ok ? await res.json() : { open: false, offers: [] };
    } catch {
      store = { open: false, offers: [] };
    }
    if (screen === "packs") render();
  }
  const packName2 = (k) => (k === "event" ? M.EVENT_PACK.name : M.TIERS[Number(k)].name);
  const grantText = (g) =>
    [...Object.entries(g.packs || {}).map(([k, n]) => `${n} ${packName2(k)} pack${n === 1 ? "" : "s"}`), g.coins ? `${coins(g.coins)} coins` : null].filter(Boolean).join(", ");

  function dealCard(o, big) {
    const closed = !store || !store.open;
    return h(
      `div.deal${big ? ".big" : ""}`,
      {},
      h("div.deal-emoji", {}, o.emoji),
      h("div", { style: "flex:1;min-width:150px" }, h("strong", {}, o.name), h("div.muted", {}, o.blurb)),
      o.soldOut
        ? h("span.got", {}, "Got it ✓")
        : h(
            "button.btn.buy",
            { disabled: closed, onclick: () => grownUpCheck(o), "aria-label": `${o.name}: ${o.price} real money` },
            closed ? "Store opening soon" : `${o.price}`,
          ),
    );
  }

  function dealsBox() {
    if (!store) return h("div.deals", {}, h("p.muted", {}, "Loading deals…"));
    if (!store.offers.length) return null;
    return h(
      "div.deals",
      {},
      h("h2", { style: "margin-top:0" }, "🔥 Deals ", h("span.real", {}, "real money")),
      store.offers.map((o) => dealCard(o)),
      h("p.muted.small", {}, store.open ? "Ask a grown-up before buying. Paid securely with Stripe. " : "Deals open soon. ", h("a", { href: "/logans-games/terms" }, "Store terms")),
    );
  }

  /** A pop-up ad now and then (every 5th pack, at most twice a visit). */
  function maybeShowAd() {
    if (!store || !store.open || adsShown >= 2 || state.packsOpened % 5 !== 0) return;
    const deals = store.offers.filter((o) => !o.soldOut);
    if (!deals.length) return;
    adsShown++;
    const o = deals[Math.floor(Math.random() * deals.length)];
    const ad = h(
      "div.overlay",
      { role: "dialog", "aria-label": "Special deal" },
      h(
        "div.ad",
        {},
        h("button.ad-close", { "aria-label": "Close", onclick: () => ad.remove() }, "✕"),
        h("div.ad-tag", {}, "⚡ SPECIAL DEAL ⚡"),
        h("div", { style: "font-size:64px" }, o.emoji),
        h("div.big", {}, o.name),
        h("p", {}, o.blurb),
        h("button.btn.buy", { onclick: () => (ad.remove(), grownUpCheck(o)) }, `Get it for ${o.price}`),
        h("p.muted.small", {}, "Costs real money: ask a grown-up first."),
        h("button.btn.ghost.small", { onclick: () => ad.remove() }, "No thanks"),
      ),
    );
    document.body.append(ad);
  }

  /** Kids' store rule: a grown-up answers a sum before any real-money checkout. */
  function grownUpCheck(o) {
    const a = 6 + Math.floor(Math.random() * 7);
    const b = 6 + Math.floor(Math.random() * 7);
    const input = h("input.answer", { inputmode: "numeric", autocomplete: "off", "aria-label": `What is ${a} times ${b}?` });
    const msg = h("p.muted", {}, "");
    const go = h("button.btn.buy", { type: "submit" }, `Pay ${o.price}`);
    const box = h(
      "div.overlay",
      { role: "dialog", "aria-label": "Grown-ups only" },
      h(
        "form.ad",
        {
          onsubmit: async (e) => {
            e.preventDefault();
            if (Number(input.value) !== a * b) {
              msg.textContent = "That's not right. Please ask a grown-up!";
              input.value = "";
              return;
            }
            go.disabled = true;
            msg.textContent = "Opening the secure checkout…";
            try {
              const res = await fetch("/api/logans-games/checkout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ offer: o.id, device: deviceId() }),
              });
              const body = await res.json().catch(() => ({}));
              if (!res.ok) throw new Error(body.error || "Couldn't start the checkout.");
              location.href = body.url;
            } catch (err) {
              msg.textContent = err.message;
              go.disabled = false;
            }
          },
        },
        h("button.ad-close", { type: "button", "aria-label": "Close", onclick: () => box.remove() }, "✕"),
        h("div", { style: "font-size:44px" }, "🔒"),
        h("div.big", {}, "Grown-ups only"),
        h("p", {}, `${o.emoji} ${o.name} costs `, h("strong", {}, `${o.price} of real money`), "."),
        h("p", {}, `To continue, what is ${a} × ${b}?`),
        input,
        go,
        msg,
        h("p.muted.small", {}, "You'll pay on Stripe's secure page. The packs go to this device only. ", h("a", { href: "/logans-games/terms" }, "Store terms")),
      ),
    );
    document.body.append(box);
    input.focus();
  }

  /** Back from Stripe: ?paid=cs_… means ask the server for the packs. */
  async function handleReturn() {
    const q = new URLSearchParams(location.search);
    const paid = q.get("paid");
    if (!paid && !q.has("canceled")) return;
    history.replaceState(null, "", location.pathname);
    if (!paid) return toast("No worries: nothing was bought.");
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const res = await fetch("/api/logans-games/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session: paid, device: deviceId() }),
        });
        const body = await res.json().catch(() => ({}));
        if (res.status === 402) {
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        if (!res.ok) return toast(body.error || "Couldn't add your packs. Reload to try again.");
        const out = M.applyGrant(state, paid, body.grant);
        setState(out.state);
        render();
        if (!out.added) return;
        sounds.win();
        confetti(100);
        const o = h(
          "div.overlay",
          { role: "dialog", "aria-label": "Thank you" },
          h("div.celebrate", {}, h("div", { style: "font-size:64px" }, "🎁"), h("div.big", {}, "THANK YOU!"), h("p", {}, `You got ${grantText(body.grant)}!`), h("p.muted", {}, "Find them under My packs."), h("button.btn", { onclick: () => o.remove() }, "Open them!")),
        );
        document.body.append(o);
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    toast("Your payment is still going through. Reload in a minute to get your packs.");
  }

  /* ---------------------------------------------------------------- */
  /* Packs and shop                                                    */
  /* ---------------------------------------------------------------- */

  let countdownTimer = null;

  /** "1d 4h" / "3h 12m" / "8m". */
  function timeLeft(ms) {
    const d = Math.floor(ms / 86400000);
    const hr = Math.floor((ms % 86400000) / 3600000);
    const min = Math.floor((ms % 3600000) / 60000);
    return d ? `${d}d ${hr}h` : hr ? `${hr}h ${min}m` : `${Math.max(1, min)}m`;
  }

  /** The Weekend Event pack on Saturdays and Sundays; a countdown the rest of the week. */
  function eventBox() {
    const on = M.isEventDay();
    const when = h("div.muted", {}, on ? `Ends in ${timeLeft(M.msUntilEventChange())}` : `Back this weekend: in ${timeLeft(M.msUntilEventChange())}`);
    return h(
      `div.event${on ? ".on" : ""}`,
      {},
      packEl("event"),
      h(
        "div",
        { style: "flex:1;min-width:170px" },
        h("strong", {}, on ? "🎉 Weekend Event is ON!" : "🎉 Weekend Event"),
        h("div", {}, `${M.EVENT_CARDS.length} Lucky monsters you can only get in this pack. Double ✨ shiny odds!`),
        when,
      ),
      on
        ? h(
            "div.row",
            { style: "flex-direction:column;align-items:stretch;gap:6px" },
            h("span.price", {}, `🪙 ${coins(M.EVENT_PACK.price)}`),
            h("button.btn", { disabled: state.coins < M.EVENT_PACK.price, onclick: () => startOpening("event", false) }, "Buy"),
          )
        : null,
    );
  }

  /** Packs you own from deals, ready to open. */
  function myPacksBox() {
    const owned = Object.entries(state.packs).filter(([, n]) => n > 0);
    if (!owned.length) return null;
    return h(
      "div.my-packs",
      {},
      h("h2", { style: "margin-top:0" }, "🎒 My packs"),
      h(
        "div.shop",
        {},
        owned.map(([k, n]) =>
          h("div.shop-item", {}, packEl(k === "event" ? "event" : Number(k)), h("span.price", {}, `×${n}`), h("button.btn.small", { onclick: () => startOpening(k === "event" ? "event" : Number(k), false, true) }, "Open")),
        ),
      ),
    );
  }

  function packsScreen() {
    clearInterval(countdownTimer);
    const canClaim = M.canClaimDaily(state);
    const countdown = h("span.muted", {});
    if (!canClaim) {
      const tick = () => {
        const ms = M.msUntilMidnight();
        const hrs = Math.floor(ms / 3600000);
        const mins = Math.floor((ms % 3600000) / 60000);
        countdown.textContent = `Next free pack in ${hrs}h ${mins}m`;
        if (M.canClaimDaily(state)) render();
      };
      tick();
      countdownTimer = setInterval(tick, 30000);
    }
    return h(
      "section",
      {},
      h(
        "div.daily",
        {},
        h("div", { style: "font-size:34px" }, "🎁"),
        h("div", { style: "flex:1;min-width:160px" }, h("strong", {}, "Daily free pack"), h("div.muted", {}, canClaim ? "A free Basic pack, every day!" : countdown)),
        h("button.btn", { disabled: !canClaim, onclick: () => startOpening(0, true) }, canClaim ? "Open free pack" : "Opened today"),
      ),
      myPacksBox(),
      dealsBox(),
      eventBox(),
      h("h2", {}, "Shop"),
      h(
        "div.shop",
        {},
        M.TIERS.map((t, i) =>
          h(
            "div.shop-item",
            {},
            packEl(i),
            h("span.price", {}, `🪙 ${coins(t.price)}`),
            h("button.btn.small", { disabled: state.coins < t.price, onclick: () => startOpening(i, false), "aria-label": `Buy ${t.name} pack for ${t.price} coins` }, "Buy"),
          ),
        ),
      ),
      h(
        "p.muted",
        {},
        `Every pack has ${M.PACK_SIZE} cards and at least one card of that pack's tier or better. Collect all ${M.SERIES[0].total} Series 1 monsters for 1 TRILLION coins, all ${M.SERIES[1].total} Series 2 monsters for 5 TRILLION, and every shiny in a series for 2 TRILLION more!`,
      ),
    );
  }

  /** Buy (or claim) a pack, then show the tear-it-open screen. */
  function startOpening(tier, free, owned) {
    const res = owned ? M.openOwnedPack(state, tier) : free ? M.claimDaily(state) : tier === "event" ? M.openEventPack(state) : M.openPack(state, tier);
    if (!res.ok) return toast(res.reason);
    setState(res.state);
    showOpening(tier, res.cards, res.rewards);
  }

  function showOpening(tier, cards, rewards) {
    clearInterval(countdownTimer);
    const progress = h("div.tear-progress");
    const top = h("div.tear-top");
    const pack = packEl(tier, true);
    pack.prepend(top);
    pack.append(progress, h("div.tear-strip", {}, "SWIPE TO RIP →"));
    const zone = h("div.tear-zone", {}, pack);
    const ripBtn = h("button.btn", { onclick: () => rip() }, "Rip!");
    const hint = h("p.muted", {}, "Swipe across the top of the pack, or tap Rip!");
    const box = h("div.opening", {}, zone, ripBtn, hint);
    const overlay = h("div.overlay", { role: "dialog", "aria-label": `${packName(tier)} pack` }, box);
    document.body.append(overlay);
    ripBtn.focus();

    // Swipe to tear: drag sideways at least ~55% of the pack's width.
    let startX = null;
    let done = false;
    zone.addEventListener("pointerdown", (e) => {
      startX = e.clientX;
      zone.setPointerCapture(e.pointerId);
    });
    zone.addEventListener("pointermove", (e) => {
      if (startX === null || done) return;
      const width = pack.getBoundingClientRect().width;
      const pct = Math.min(1, Math.abs(e.clientX - startX) / (width * 0.55));
      progress.style.width = `${pct * 100}%`;
      if (pct >= 1) rip();
    });
    zone.addEventListener("pointerup", () => {
      startX = null;
      if (!done) progress.style.width = "0";
    });

    function rip() {
      if (done) return;
      done = true;
      sounds.tear();
      zone.classList.add("ripped");
      ripBtn.remove();
      hint.remove();
      setTimeout(() => showCards(), 650);
    }

    function showCards() {
      zone.remove();
      let revealed = 0;
      const slots = cards.map((c) => {
        const card = M.CARD_BY_ID.get(c.id);
        const slot = h(
          "button.flip",
          { "aria-label": "Tap to reveal", style: "background:none;padding:0;position:relative" },
          h("div.inner", {}, h("div.face", {}, cardEl(card, { shiny: c.shiny })), h("div.back", {}, "👾")),
        );
        slot.addEventListener("click", () => reveal(slot, c, card));
        return slot;
      });
      const row = h("div.reveal", {}, slots);
      const allBtn = h("button.btn.ghost", { onclick: () => slots.forEach((s, i) => setTimeout(() => s.click(), i * 220)) }, "Reveal all");
      const doneBtn = h(
        "button.btn",
        {
          onclick: () => {
            overlay.remove();
            if (rewards.length) celebrate(rewards);
            render();
            if (!rewards.length) maybeShowAd();
          },
        },
        "Done",
      );
      doneBtn.hidden = true;
      const summary = h("p.muted", {});
      box.replaceChildren(h("h2", {}, `${packName(tier)} pack`), row, h("div.row", {}, allBtn, doneBtn), summary);

      function reveal(slot, c, card) {
        if (slot.classList.contains("shown")) return;
        slot.classList.add("shown");
        slot.setAttribute("aria-label", `${card.name}, ${M.TIERS[card.tier].name}${c.shiny ? ", shiny" : ""}${c.isNew ? ", new" : ""}`);
        if (c.isNew) slot.append(h("span.new-badge", {}, "NEW"));
        if (card.tier >= 3 || c.shiny || card.event) {
          sounds.big(card.tier);
          slot.querySelector(".card").classList.add("burst");
          if (card.tier >= 4) confetti(Math.min(card.tier, 10) * 6);
          if (card.tier >= 4 && navigator.vibrate) navigator.vibrate([60, 40, 120]);
        } else sounds.flip(card.tier);
        revealed++;
        if (revealed === cards.length) {
          allBtn.remove();
          doneBtn.hidden = false;
          doneBtn.focus();
          const fresh = cards.filter((x) => x.isNew).length;
          summary.textContent = fresh ? `${fresh} new card${fresh === 1 ? "" : "s"} for your index!` : "No new cards this time. Sell extras for coins in the Index.";
        }
      }
    }
  }

  /** Big party for index rewards: [{ label, coins }]. */
  function celebrate(rewards) {
    sounds.win();
    confetti(120);
    const total = rewards.reduce((n, r) => n + r.coins, 0);
    const overlay = h(
      "div.overlay",
      { role: "dialog", "aria-label": "Index reward" },
      h(
        "div.celebrate",
        {},
        h("div", { style: "font-size:64px" }, "🏆"),
        h("div.big", {}, `+${coins(total)} COINS!`),
        rewards.map((r) => h("p", {}, `You collected ${r.label}: +${coins(r.coins)}. LEGEND!`)),
        h("button.btn", { onclick: () => overlay.remove() }, "Awesome!"),
      ),
    );
    document.body.append(overlay);
  }

  /* ---------------------------------------------------------------- */
  /* Index (album)                                                     */
  /* ---------------------------------------------------------------- */

  function indexScreen() {
    const series = M.SERIES[Number(view.series) - 1] || M.SERIES[0];
    const have = view.shiny ? M.shinyCount(state, series.id) : M.collectedCount(state, series.id);
    const extraValue = M.extrasValue(state);
    const won =
      series.id === 1 ? state.rewardClaimed : state.rewards.series2;
    const shinyWon = state.rewards[`shiny${series.id}`];
    const headline = view.shiny
      ? `✨ Shinies ${have} / ${series.total}`
      : `${series.name}: ${have} / ${series.total}`;
    const subline = view.shiny
      ? shinyWon
        ? `🏆 Every ${series.name} shiny found: 2 trillion coins won!`
        : `Find every ${series.name} shiny to win 2 TRILLION coins`
      : won
        ? `🏆 ${series.name} complete: ${coins(series.reward)} coins won!`
        : `Collect them all to win ${coins(series.reward)} coins${series.id === 2 ? " (includes 10 Weekend Event monsters)" : ""}`;
    const select = (key, options, label) =>
      h(
        "select",
        { "aria-label": label, onchange: (e) => ((view[key] = e.target.value), render()) },
        options.map(([value, text]) => h("option", { value, selected: view[key] === value }, text)),
      );
    const list = M.CARDS.filter(
      (c) =>
        c.series === series.id &&
        (view.type === "all" || c.type === view.type) &&
        (view.tier === "all" || String(c.tier) === view.tier) &&
        (view.show === "all" || (view.show === "have") === Boolean(view.shiny ? state.shiny[c.id] : state.owned[c.id] || state.shiny[c.id])),
    );
    const seriesTab = (id, label) =>
      h("button.chip", { "aria-pressed": view.series === id ? "true" : "false", onclick: () => ((view.series = id), (view.tier = "all"), render()) }, label);
    return h(
      "section",
      {},
      h(
        "div.row",
        { style: "justify-content:space-between" },
        h("div", {}, h("strong", { style: "font-size:20px" }, headline), h("div.muted", {}, subline)),
        h(
          "button.btn",
          {
            disabled: extraValue === 0,
            onclick: () => {
              const res = M.sellAllExtras(state);
              setState(res.state);
              sounds.coin();
              toast(`Sold extras for 🪙 ${coins(res.earned)}`);
              render();
            },
          },
          extraValue ? `Sell all extras (+${coins(extraValue)})` : "No extras to sell",
        ),
      ),
      h("div.progress", { role: "progressbar", "aria-valuemin": 0, "aria-valuemax": series.total, "aria-valuenow": have, style: "margin-top:10px" }, h("div", { style: `width:${(have / series.total) * 100}%` })),
      h(
        "div.filters",
        {},
        seriesTab("1", `Series 1 (${M.collectedCount(state, 1)}/${M.SERIES[0].total})`),
        seriesTab("2", `Series 2 (${M.collectedCount(state, 2)}/${M.SERIES[1].total})`),
        h("button.chip.shiny-chip", { "aria-pressed": view.shiny ? "true" : "false", onclick: () => ((view.shiny = !view.shiny), render()) }, `✨ Shiny index ${view.shiny ? "on" : "off"}`),
      ),
      h(
        "div.filters",
        {},
        select("type", [["all", "All types"], ...M.TYPES.map((t) => [t, `${TYPE_ICON[t]} ${M.TYPE_NAMES[t]}`])], "Type"),
        select(
          "tier",
          [["all", "All tiers"], ...M.TIERS.map((t, i) => [String(i), t.name]).filter(([i]) => M.CARDS.some((c) => c.series === series.id && String(c.tier) === i))],
          "Tier",
        ),
        select("show", [["all", "All cards"], ["have", "Have"], ["missing", "Missing"]], "Show"),
      ),
      h(
        "div.grid",
        {},
        list.map((c) => {
          const n = state.owned[c.id] || 0;
          const sh = state.shiny[c.id] || 0;
          const missing = view.shiny ? !sh : !n && !sh;
          return h(
            "button",
            { "aria-label": missing ? `#${c.id}, ${view.shiny ? "no shiny" : "not found"} yet` : c.name, onclick: () => (n || sh) && showDetail(c) },
            cardEl(c, { small: true, missing, shiny: view.shiny ? sh > 0 : !n && sh > 0, count: view.shiny ? sh : n + sh }),
          );
        }),
      ),
    );
  }

  function showDetail(card) {
    const close = () => (overlay.remove(), render());
    const n = state.owned[card.id] || 0;
    const sh = state.shiny[card.id] || 0;
    const sellBtn = (shiny) =>
      h(
        "button.btn.small",
        {
          disabled: (shiny ? sh : n) < 2,
          onclick: () => {
            const res = M.sellOne(state, card.id, shiny);
            if (!res.ok) return toast(res.reason);
            setState(res.state);
            sounds.coin();
            toast(`+🪙 ${coins(M.sellValue(card.id, shiny))}`);
            overlay.remove();
            showDetail(card);
          },
        },
        `Sell 1${shiny ? " shiny" : ""} (+${coins(M.sellValue(card.id, shiny))})`,
      );
    const overlay = h(
      "div.overlay",
      { role: "dialog", "aria-label": card.name, onclick: (e) => e.target === overlay && close() },
      h(
        "div.detail",
        {},
        cardEl(card, { shiny: sh > 0 && !n }),
        h("p", { style: "margin:0;text-align:center" }, card.desc),
        h("div.muted", {}, `❤️ ${card.hp} HP · ⚔️ ${card.power} power · ${M.TIERS[card.tier].name} · Series ${card.series}${card.event ? " · 🎉 Weekend Event" : ""}`),
        h("div.muted", {}, `You have ${n} normal${sh ? ` and ${sh} ✨ shiny` : ""}`),
        h("div.row", { style: "justify-content:center" }, n > 1 ? sellBtn(false) : null, sh > 1 ? sellBtn(true) : null),
        h("button.btn.ghost", { onclick: close }, "Close"),
      ),
    );
    document.body.append(overlay);
  }

  /* ---------------------------------------------------------------- */
  /* Battles                                                           */
  /* ---------------------------------------------------------------- */

  const battle = { difficulty: 0, team: [] };

  function ownedCards() {
    return M.CARDS.filter((c) => state.owned[c.id] || state.shiny[c.id]).sort((a, b) => b.power - a.power);
  }

  function battleScreen() {
    const mine = ownedCards();
    if (mine.length < 3) {
      return h("section", {}, h("h2", {}, "Battle"), h("p.muted", {}, `You need at least 3 different cards to battle. Open some packs first! (You have ${mine.length}.)`), h("button.btn", { onclick: () => ((screen = "packs"), render()) }, "Go to packs"));
    }
    battle.team = battle.team.filter((id) => mine.some((c) => c.id === id));
    const start = h("button.btn", { disabled: battle.team.length !== 3, onclick: () => runBattle() }, battle.team.length === 3 ? "Battle!" : `Pick ${3 - battle.team.length} more`);
    return h(
      "section",
      {},
      h("h2", {}, "1. Choose a level"),
      h(
        "div.row",
        {},
        M.DIFFICULTIES.map((d, i) =>
          h(
            `button.btn${battle.difficulty === i ? "" : ".ghost"}`,
            { "aria-pressed": battle.difficulty === i ? "true" : "false", onclick: () => ((battle.difficulty = i), render()) },
            `${d.name}`,
          ),
        ),
      ),
      h("p.muted", {}, `Win to earn about 🪙 ${battle.team.length === 3 ? coins(M.battleReward(battle.team, battle.difficulty)) : "?"}. Type matters: 🔥 beats 🍃 and ❄️, 💧 beats 🔥, 🍃 beats 💧, ⚡ beats 💧, ❄️ beats 🍃.`),
      h("h2", {}, "2. Pick your team of 3"),
      h(
        "div.choose",
        {},
        mine.map((c) => {
          const on = battle.team.includes(c.id);
          return h(
            "button",
            {
              "aria-pressed": on ? "true" : "false",
              "aria-label": `${c.name}, power ${c.power}`,
              onclick: () => {
                if (on) battle.team = battle.team.filter((x) => x !== c.id);
                else if (battle.team.length < 3) battle.team = [...battle.team, c.id];
                render();
              },
            },
            cardEl(c, { small: true, shiny: !state.owned[c.id] }),
          );
        }),
      ),
      h("div.row", { style: "margin-top:14px;position:sticky;bottom:10px" }, start),
    );
  }

  function runBattle() {
    const cpu = M.cpuTeam(battle.team, battle.difficulty);
    const used = { player: new Set(), cpu: new Set() };
    let wins = 0;
    let losses = 0;
    let busy = false;
    const box = h("div.opening", {});
    const overlay = h("div.overlay", { role: "dialog", "aria-label": "Battle" }, box);
    document.body.append(overlay);
    drawPick();

    function teamRow(ids, side, onPick) {
      return h(
        "div.team-row",
        {},
        ids.map((id) => {
          const c = M.CARD_BY_ID.get(id);
          const el = cardEl(c, { small: true });
          if (used[side].has(id)) el.classList.add("used");
          return onPick && !used[side].has(id) ? h("button", { "aria-label": `Send ${c.name}`, onclick: () => onPick(id) }, el) : el;
        }),
      );
    }

    function drawPick() {
      box.replaceChildren(
        h("div.score", {}, `You ${wins} – ${losses} CPU`),
        h("p.muted", {}, "Their team:"),
        teamRow(cpu, "cpu"),
        h("p", { style: "font-weight:800" }, "Tap one of your monsters to send it in:"),
        teamRow(battle.team, "player", fight),
      );
    }

    function fight(playerId) {
      if (busy) return;
      busy = true;
      const left = cpu.filter((id) => !used.cpu.has(id));
      const cpuId = left[Math.floor(Math.random() * left.length)];
      used.player.add(playerId);
      used.cpu.add(cpuId);
      const result = M.duel(playerId, cpuId);
      const a = M.CARD_BY_ID.get(playerId);
      const b = M.CARD_BY_ID.get(cpuId);
      const barA = h("div", { style: "width:100%" });
      const barB = h("div", { style: "width:100%" });
      const cardA = cardEl(a);
      const cardB = cardEl(b);
      const dmgA = h("div.dmg");
      const dmgB = h("div.dmg");
      const mult = M.typeMultiplier(a.type, b.type);
      box.replaceChildren(
        h("div.score", {}, `You ${wins} – ${losses} CPU`),
        h(
          "div.arena",
          {},
          h("div.fighter", {}, cardA, h("div.hp", {}, barA), dmgA),
          h("div.vs", {}, "VS"),
          h("div.fighter", {}, cardB, h("div.hp", {}, barB), dmgB),
        ),
        h("p.muted", {}, mult > 1 ? "Super effective! 💥" : mult < 1 ? "Not very effective…" : ""),
      );
      let i = 0;
      const step = () => {
        if (i >= result.hits.length) return finishRound(result.winner);
        const hit = result.hits[i++];
        const target = hit.by === "player" ? cardB : cardA;
        (hit.by === "player" ? dmgB : dmgA).textContent = `-${hit.dmg}`;
        target.classList.remove("hit");
        void target.offsetWidth;
        target.classList.add("hit");
        sounds.hit();
        barA.style.width = `${(hit.hpA / result.maxA) * 100}%`;
        barB.style.width = `${(hit.hpB / result.maxB) * 100}%`;
        setTimeout(step, 420);
      };
      setTimeout(step, 500);
    }

    function finishRound(winner) {
      if (winner === "player") wins++;
      else losses++;
      busy = false;
      if (wins === 2 || losses === 2) return finishBattle(wins === 2);
      toast(winner === "player" ? "You won the round!" : "They won the round!");
      setTimeout(drawPick, 900);
    }

    function finishBattle(won) {
      let reward = 0;
      if (won) {
        reward = M.battleReward(battle.team, battle.difficulty);
        setState({ ...state, coins: state.coins + reward, battlesWon: state.battlesWon + 1 });
        sounds.win();
        confetti(30);
      } else sounds.lose();
      box.replaceChildren(
        h("div", { style: "font-size:64px" }, won ? "🏆" : "😵"),
        h("div.score", {}, won ? `You win! +🪙 ${coins(reward)}` : "You lost this time!"),
        h("p.muted", {}, `Final score: You ${wins} – ${losses} CPU`),
        h("div.row", { style: "justify-content:center" }, h("button.btn", { onclick: () => (overlay.remove(), runBattle()) }, "Battle again"), h("button.btn.ghost", { onclick: () => (overlay.remove(), render()) }, "Done")),
      );
    }
  }

  render();
  loadStore();
  handleReturn();
})();
