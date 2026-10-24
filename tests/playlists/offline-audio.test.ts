import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import {
  listOfflinePlaylists,
  offlineAudioBytes,
  offlineAudioUrl,
  offlineTrackIds,
  removePlaylistOffline,
  savePlaylistOffline,
} from "@/lib/player/offline-audio";
import { nextIndex, prevIndex, shuffled } from "@/lib/player/queue";
import { pickSource } from "@/lib/player/source";

const { parseRange, rangeResponse, rangeFromBlob, OPEN_RANGE_CAP } = createRequire(import.meta.url)("../../public/sw-range.js");

function fakeDeps() {
  const store = new Map<string, string>();
  const cache = new Map<string, Response>();
  return {
    cache: async () => ({
      match: async (k: RequestInfo | URL) => cache.get(String(k))?.clone(),
      put: async (k: RequestInfo | URL, r: Response) => void cache.set(String(k), r),
      delete: async (k: RequestInfo | URL) => cache.delete(String(k)),
    }),
    storage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
    files: cache,
    store,
  };
}

const song = (id: string) => ({ id, title: `Song ${id}`, artist: null, durationSec: 60, mime: "audio/mpeg" });

describe("offline playlists", () => {
  it("downloads each song once, even across playlists, and reports progress", async () => {
    const deps = fakeDeps();
    const fetched: string[] = [];
    const fetchTrack = async (t: { id: string }) => {
      fetched.push(t.id);
      return new Blob([new Uint8Array(t.id === "a" ? 10 : 20)]);
    };
    const steps: number[] = [];
    await savePlaylistOffline({ id: "p1", name: "One" }, [song("a"), song("b")], fetchTrack, (p) => steps.push(p.done), deps);
    await savePlaylistOffline({ id: "p2", name: "Two" }, [song("b"), song("c")], fetchTrack, undefined, deps);
    expect(fetched.sort()).toEqual(["a", "b", "c"]);
    expect(steps).toEqual([0, 1, 2]);
    expect([...offlineTrackIds(deps)].sort()).toEqual(["a", "b", "c"]);
    expect(offlineAudioBytes(deps)).toBe(10 + 20 + 20);
    expect(listOfflinePlaylists(deps).find((p) => p.id === "p2")!.tracks.map((t) => [t.id, t.size])).toEqual([
      ["b", 20],
      ["c", 20],
    ]);
  });

  it("keeps songs another offline playlist still needs", async () => {
    const deps = fakeDeps();
    const blob = async () => new Blob([new Uint8Array(5)]);
    await savePlaylistOffline({ id: "p1", name: "One" }, [song("a"), song("b")], blob, undefined, deps);
    await savePlaylistOffline({ id: "p2", name: "Two" }, [song("b")], blob, undefined, deps);
    await removePlaylistOffline("p1", deps);
    expect(deps.files.has(offlineAudioUrl("a"))).toBe(false);
    expect(deps.files.has(offlineAudioUrl("b"))).toBe(true);
    expect(listOfflinePlaylists(deps).map((p) => p.id)).toEqual(["p2"]);
  });

  it("doesn't record a playlist whose download failed, but keeps what arrived", async () => {
    const deps = fakeDeps();
    const flaky = async (t: { id: string }) => {
      if (t.id === "b") throw new Error("network");
      return new Blob([new Uint8Array(1)]);
    };
    await expect(savePlaylistOffline({ id: "p", name: "P" }, [song("a"), song("b")], flaky, undefined, deps)).rejects.toThrow();
    expect(listOfflinePlaylists(deps)).toEqual([]);
    expect(deps.files.has(offlineAudioUrl("a"))).toBe(true);
  });

  it("survives a corrupt index", () => {
    const deps = fakeDeps();
    deps.store.set("offline-playlists", "{nope");
    expect(listOfflinePlaylists(deps)).toEqual([]);
    deps.store.set("offline-playlists", JSON.stringify([{ id: "x" }, null, { id: "y", tracks: [] }]));
    expect(listOfflinePlaylists(deps).map((p) => p.id)).toEqual(["y"]);
  });
});

describe("service-worker byte ranges", () => {
  it("parses the forms Safari and Chrome send", () => {
    expect(parseRange("bytes=0-1", 10)).toEqual({ start: 0, end: 1 });
    expect(parseRange("bytes=0-", 10)).toEqual({ start: 0, end: 9 });
    expect(parseRange("bytes=5-100", 10)).toEqual({ start: 5, end: 9 });
    expect(parseRange("bytes=-3", 10)).toEqual({ start: 7, end: 9 });
    expect(parseRange("bytes=10-", 10)).toBeNull();
    expect(parseRange("bytes=0-1,4-5", 10)).toBeNull();
    expect(parseRange("items=0-1", 10)).toBeNull();
  });

  it("answers 206 with the right slice, 200 without Range, 416 when unsatisfiable", async () => {
    const full = () => new Response(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]), { headers: { "Content-Type": "audio/mpeg" } });
    const part = await rangeResponse(full(), "bytes=2-4");
    expect(part.status).toBe(206);
    expect(part.headers.get("Content-Range")).toBe("bytes 2-4/10");
    expect(part.headers.get("Content-Type")).toBe("audio/mpeg");
    expect([...new Uint8Array(await part.arrayBuffer())]).toEqual([2, 3, 4]);
    const whole = await rangeResponse(full(), null);
    expect(whole.status).toBe(200);
    expect(whole.headers.get("Accept-Ranges")).toBe("bytes");
    expect((await rangeResponse(full(), "bytes=20-")).status).toBe(416);
  });
});

describe("service worker stays light", () => {
  it("caps an open-ended range at 2 MB; the player asks for the rest", async () => {
    const size = 5 * 1024 * 1024;
    const blob = new Blob([new Uint8Array(size)]);
    const first = rangeFromBlob(blob, "audio/mpeg", "bytes=0-");
    expect(first.status).toBe(206);
    expect(first.headers.get("Content-Range")).toBe(`bytes 0-${OPEN_RANGE_CAP - 1}/${size}`);
    expect(Number(first.headers.get("Content-Length"))).toBe(OPEN_RANGE_CAP);
    const tail = rangeFromBlob(blob, "audio/mpeg", `bytes=${size - 10}-`);
    expect(tail.headers.get("Content-Range")).toBe(`bytes ${size - 10}-${size - 1}/${size}`);
    // An explicit end is honoured as asked.
    expect(rangeFromBlob(blob, "audio/mpeg", "bytes=0-3145727").headers.get("Content-Length")).toBe("3145728");
  });
});

describe("where a song plays from", () => {
  const net = { id: "a", src: "https://bucket.s3/x?sig" };
  it("uses S3 online, the device copy offline or after a network error", () => {
    expect(pickSource(net, { online: true, kept: true, failed: false })).toBe(net.src);
    expect(pickSource(net, { online: false, kept: true, failed: false })).toBe("/offline-audio/a");
    expect(pickSource(net, { online: true, kept: true, failed: true })).toBe("/offline-audio/a");
    expect(pickSource(net, { online: false, kept: false, failed: false })).toBe(net.src);
    expect(pickSource({ id: "a", src: "/offline-audio/a" }, { online: true, kept: false, failed: false })).toBe("/offline-audio/a");
  });
});

describe("play order", () => {
  it("moves on, wraps only when repeating, and restarts at the top", () => {
    expect(nextIndex(0, 3, "off")).toBe(1);
    expect(nextIndex(2, 3, "off")).toBeNull();
    expect(nextIndex(2, 3, "all")).toBe(0);
    expect(prevIndex(0, 3, "off")).toBe(0);
    expect(prevIndex(0, 3, "all")).toBe(2);
    expect(nextIndex(0, 0, "all")).toBeNull();
  });

  it("shuffles every song exactly once, starting with the one playing", () => {
    const order = shuffled(10, 4);
    expect(order[0]).toBe(4);
    expect([...order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const seq = [0.1, 0.9, 0.5, 0.3, 0.7, 0.2, 0.8, 0.4, 0.6];
    let i = 0;
    expect(shuffled(10, 4, () => seq[i++ % seq.length]!)).toEqual(shuffled(10, 4, (() => { let j = 0; return () => seq[j++ % seq.length]!; })()));
  });
});
