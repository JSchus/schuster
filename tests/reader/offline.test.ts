import { describe, expect, it } from "vitest";
import { isOffline, listOffline, offlineKey, readOffline, removeOffline, saveOffline } from "@/lib/reader/offline";

function fakes() {
  const entries = new Map<string, Response>();
  const store = new Map<string, string>();
  const cache = {
    match: async (key: RequestInfo | URL) => entries.get(String(key))?.clone(),
    put: async (key: RequestInfo | URL, res: Response) => void entries.set(String(key), res),
    delete: async (key: RequestInfo | URL) => entries.delete(String(key)),
  };
  return {
    entries,
    deps: {
      cache: async () => cache as unknown as Cache,
      storage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
    },
  };
}

describe("offline books", () => {
  it("saves, lists, reads back and removes a book", async () => {
    const { entries, deps } = fakes();
    const data = new TextEncoder().encode("epub bytes").buffer as ArrayBuffer;
    await saveOffline({ id: "b1", title: "Dune", mime: "application/epub+zip" }, data, deps);

    expect(entries.has(offlineKey("b1"))).toBe(true);
    expect(isOffline("b1", deps)).toBe(true);
    expect(listOffline(deps)).toMatchObject([{ id: "b1", title: "Dune", size: 10 }]);
    expect(new TextDecoder().decode(await readOffline("b1", deps))).toBe("epub bytes");

    await removeOffline("b1", deps);
    expect(isOffline("b1", deps)).toBe(false);
    expect(await readOffline("b1", deps)).toBeUndefined();
  });

  it("replaces an existing entry instead of duplicating it", async () => {
    const { deps } = fakes();
    const data = new ArrayBuffer(4);
    await saveOffline({ id: "b1", title: "Old", mime: "application/pdf" }, data, deps);
    await saveOffline({ id: "b1", title: "New", mime: "application/pdf" }, data, deps);
    expect(listOffline(deps).map((b) => b.title)).toEqual(["New"]);
  });

  it("survives a corrupted index", () => {
    const { deps } = fakes();
    deps.storage.setItem("offline-books", "{not json");
    expect(listOffline(deps)).toEqual([]);
  });
});
