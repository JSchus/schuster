import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

// The game's rules live in a plain script the browser loads; Node loads the same file.
const R = createRequire(import.meta.url)("../../public/logans-games/race-and-stream/logic.js");

type State = ReturnType<typeof R.newState>;
const rich = (over: Partial<State> = {}): State => ({ ...R.newState(), money: 1e9, ...over });

describe("Race & Stream: Logan's rules", () => {
  it("starts with a Go-Kart, an old laptop, a phone camera and a headset", () => {
    const s = R.newState();
    expect(s.money).toBe(100);
    expect(s.subs).toBe(0);
    expect(s.using).toEqual({ car: "kart", pc: "laptop", camera: "phone", mic: "headset" });
  });

  it("sells faster cars and better gear, and lets you switch back to what you own", () => {
    expect(R.CARS.map((c: { price: number }) => c.price)).toEqual([0, 500, 3000, 15000, 75000]);
    for (const list of [R.CARS, R.PCS, R.CAMERAS, R.MICS]) {
      // Each step up costs more and is better.
      for (let i = 1; i < list.length; i++) {
        expect(list[i].price).toBeGreaterThan(list[i - 1].price);
        expect(list[i].top ?? list[i].mult).toBeGreaterThan(list[i - 1].top ?? list[i - 1].mult);
      }
    }
    expect(R.buy(R.newState(), "car", "street").ok).toBe(false); // only 100 to start
    let s = R.buy({ ...R.newState(), money: 600 }, "car", "street").state;
    expect(s.money).toBe(100);
    expect(s.using.car).toBe("street");
    s = R.buy(s, "car", "kart").state;
    expect(s.using.car).toBe("kart");
    expect(s.money).toBe(100); // switching back is free
    expect(R.buy(s, "car", "nope").ok).toBe(false);
  });

  it("unlocks tracks and live streaming with subscribers", () => {
    expect(R.TRACKS.map((t: { subs: number }) => t.subs)).toEqual([0, 1000, 100000, 1000000]);
    expect(R.trackUnlocked({ subs: 999 }, R.TRACKS[1])).toBe(false);
    expect(R.trackUnlocked({ subs: 1000 }, R.TRACKS[1])).toBe(true);
    expect(R.liveUnlocked({ subs: 999 })).toBe(false);
    expect(R.liveUnlocked({ subs: 1000 })).toBe(true);
    expect(R.newMilestones(900, 120000).map((m: { subs: number }) => m.subs)).toEqual([1000, 100000]);
    expect(R.newMilestones(1000, 2000)).toEqual([]);
    expect(R.nextMilestone(5000).subs).toBe(100000);
    expect(R.nextMilestone(2e6)).toBeNull();
  });

  it("pays more for better places and harder tracks, and saves a race clip", () => {
    const first = R.racePrize(0, 1);
    const last = R.racePrize(0, 4);
    expect(first.money).toBe(120);
    expect(last.money).toBeLessThan(first.money);
    expect(R.racePrize(3, 1).money).toBeGreaterThan(R.racePrize(2, 1).money);
    const res = R.finishRace(R.newState(), 0, 1, 23_456);
    expect(res.state.money).toBe(100 + 120);
    expect(res.state.subs).toBe(first.subs);
    expect(res.state.clip).toEqual({ track: "rookie", place: 1 });
    expect(res.state.stats).toMatchObject({ races: 1, wins: 1 });
    expect(res.state.bestLaps.rookie).toBe(23_456);
    expect(R.finishRace(res.state, 0, 2, 30_000).state.bestLaps.rookie).toBe(23_456); // slower lap isn't a record
  });

  it("pays more for the arcade game on a better PC, with bonus fans for a new high score", () => {
    const laptop = R.finishArcade(R.newState(), 500);
    const ultra = R.finishArcade(R.buy(rich(), "pc", "ultra").state, 500);
    expect(ultra.pay.money).toBe(laptop.pay.money * 4);
    expect(laptop.state.arcadeBest).toBe(500);
    const again = R.finishArcade(laptop.state, 800);
    expect(again.record).toBe(true);
    expect(again.pay.subs).toBeGreaterThan(R.arcadePay(800, 1).subs);
    expect(R.finishArcade(again.state, 100).record).toBe(false);
  });

  it("makes videos: needs a race or arcade score for those topics, and better gear means more views", () => {
    const s0 = R.newState();
    expect(R.topicProblem(s0, "race")).toMatch(/race/);
    expect(R.topicProblem(s0, "gaming")).toMatch(/arcade/);
    expect(R.postVideo(s0, { topic: "race", titleStyle: "normal", title: "x", thumb: "plain", quality: 1 }).ok).toBe(false);

    const v = (s: State, over = {}) =>
      R.postVideo(s, { topic: "vlog", titleStyle: "normal", title: "Day in my life", thumb: "plain", quality: 0.8, ...over }, R.seeded(1));
    const phone = v(s0);
    expect(phone.ok).toBe(true);
    expect(phone.video.views).toBeGreaterThan(0);
    expect(phone.state.videos).toHaveLength(1);
    expect(phone.state.money).toBe(100 + phone.video.money);
    expect(phone.state.subs).toBe(phone.video.subs);

    const studio = v(R.buy(rich(), "camera", "studio").state);
    expect(studio.video.views).toBeGreaterThan(phone.video.views * 3);
    expect(v(s0, { quality: 0 }).video.views).toBeLessThan(phone.video.views);
    const bait = v(s0, { titleStyle: "clickbait" }).video;
    expect(bait.views).toBeGreaterThan(phone.video.views);
    expect(bait.likes / bait.views).toBeLessThan(phone.video.likes / phone.video.views);
    // The same topic again and again gets fewer views.
    expect(v(phone.state).video.views).toBeLessThan(phone.video.views);
    expect(R.titlesFor(R.finishRace(s0, 0, 1, 0).state, "race")[0].text).toMatch(/I WON on Rookie Ring/);
  });

  it("gives sponsor money from 100K subscribers", () => {
    const base = { topic: "vlog", titleStyle: "normal", title: "t", thumb: "plain", quality: 1 };
    const a = R.postVideo({ ...R.newState(), subs: 99_999 }, base, R.seeded(2)).video;
    const b = R.postVideo({ ...R.newState(), subs: 100_000 }, base, R.seeded(2)).video;
    expect(b.money / b.views).toBeCloseTo(0.03, 2);
    expect(a.money / a.views).toBeCloseTo(0.02, 2);
  });

  it("only lets you go live from 1K subscribers; a better mic and a happy chat pay more", () => {
    expect(R.finishLive(R.newState(), { peak: 100, happy: 1, tips: 0 }).ok).toBe(false);
    const s = { ...R.newState(), subs: 5000 };
    expect(R.liveStartViewers(s)).toBe(55);
    const sad = R.finishLive(s, { peak: 200, happy: 0, tips: 0 });
    const happy = R.finishLive(s, { peak: 200, happy: 1, tips: 50 });
    expect(happy.subs).toBeGreaterThan(sad.subs);
    expect(happy.money).toBe(sad.money + 50);
    const mic = R.buy({ ...s, money: 1e6 }, "mic", "studio").state;
    expect(R.liveStartViewers(mic)).toBeGreaterThan(R.liveStartViewers(s));
    expect(R.finishLive(mic, { peak: 200, happy: 0, tips: 0 }).money).toBe(sad.money * 2);
  });

  it("reports milestones the moment they're reached", () => {
    const res = R.earn({ ...R.newState(), subs: 990 }, 0, 20);
    expect(res.milestones.map((m: { subs: number }) => m.subs)).toEqual([1000]);
    expect(R.earn(res.state, 0, 5).milestones).toEqual([]);
  });

  it("saves and loads, and starts fresh from a broken save", () => {
    const s = R.finishRace(R.buy({ ...R.newState(), money: 600 }, "car", "street").state, 0, 2, 30_000).state;
    expect(R.loadState(JSON.stringify(s))).toEqual(s);
    expect(R.loadState("{oops")).toEqual(R.newState());
    expect(R.loadState(JSON.stringify({ v: 9 }))).toEqual(R.newState());
  });

  it("shows numbers and lap times nicely", () => {
    expect(R.short(950)).toBe("950");
    expect(R.short(12_500)).toBe("12.5K");
    expect(R.short(3_200_000)).toBe("3.2M");
    expect(R.lapTime(83_456)).toBe("1:23.46");
  });
});
