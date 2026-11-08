/**
 * Logan's games, shown on the public /logans-games page. Each game is a
 * folder of static files in public/logans-games/{slug}/ with an index.html;
 * adding a game means adding its folder and one entry here.
 */
export type LoganGame = {
  slug: string;
  title: string;
  blurb: string;
  emoji: string;
  /** When it was added (YYYY-MM-DD), newest shown first. */
  added: string;
};

export const LOGANS_GAMES: LoganGame[] = [
  {
    slug: "monster-packs",
    title: "Monster Packs",
    blurb: "Rip open packs, collect all 200 monsters, battle, and win 1 trillion coins.",
    emoji: "👾",
    added: "2026-11-08",
  },
];
