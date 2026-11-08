import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { authConfig } from "@/auth.config";
import { LOGANS_GAMES } from "@/lib/logans-games/games";

const root = fileURLToPath(new URL("../../", import.meta.url));

describe("Logan's Games on the site", () => {
  it("has a folder with an index.html for every listed game", () => {
    expect(LOGANS_GAMES.length).toBeGreaterThan(0);
    for (const g of LOGANS_GAMES) {
      expect(g.slug).toMatch(/^[a-z0-9-]+$/);
      expect(existsSync(`${root}public/logans-games/${g.slug}/index.html`)).toBe(true);
    }
  });

  it("lets anyone see the arcade, while the rest of the site still needs sign-in", () => {
    const authorized = authConfig.callbacks.authorized as (args: { auth: unknown; request: { nextUrl: URL } }) => unknown;
    const visit = (path: string) => authorized({ auth: null, request: { nextUrl: new URL(`https://schuster.me${path}`) } });
    expect(visit("/logans-games")).toBe(true);
    expect(visit("/logans-games/")).toBe(true);
    expect(visit("/")).toBe(false);
    expect(visit("/contacts")).toBe(false);
    expect(visit("/logans-games-admin")).toBe(false);
  });
});
