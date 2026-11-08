import type { Metadata } from "next";
import { LOGANS_GAMES } from "@/lib/logans-games/games";

// Anyone with the link can play, but keep it off search engines.
export const metadata: Metadata = {
  title: "Logan's Games",
  description: "Games made by Logan.",
  robots: { index: false, follow: false },
};

/** Public arcade (no sign-in): every game Logan has made. */
export default function LogansGamesPage() {
  const games = [...LOGANS_GAMES].sort((a, b) => b.added.localeCompare(a.added));
  return (
    <main
      className="min-h-dvh px-4 py-10"
      style={{ background: "radial-gradient(circle at 50% 0%, #3b2a8a, #14102a 60%)", color: "#f4f1ff" }}
    >
      <div className="mx-auto grid max-w-3xl gap-8">
        <header className="grid gap-2 text-center">
          <div className="text-5xl" aria-hidden>
            🕹️
          </div>
          <h1 className="text-4xl font-black tracking-tight">Logan&apos;s Games</h1>
          <p className="opacity-75">Made by Logan. Tap a game to play: no sign-in needed.</p>
        </header>
        <ul className="grid gap-4 sm:grid-cols-2">
          {games.map((g) => (
            <li key={g.slug}>
              {/* A plain link: games are their own pages, not part of the app. */}
              <a
                href={`/logans-games/${g.slug}`}
                className="grid gap-3 rounded-2xl p-5 shadow-lg transition-transform hover:-translate-y-1"
                style={{ background: "#221b45", boxShadow: "0 8px 24px #0008" }}
              >
                <span className="text-5xl" aria-hidden>
                  {g.emoji}
                </span>
                <span className="text-2xl font-extrabold">{g.title}</span>
                <span className="opacity-80">{g.blurb}</span>
                <span
                  className="w-fit rounded-xl px-5 py-2.5 font-extrabold"
                  style={{ background: "#ffcf3d", color: "#241a00" }}
                >
                  ▶ Play
                </span>
              </a>
            </li>
          ))}
        </ul>
        <footer className="text-center text-sm opacity-60">More games coming soon!</footer>
      </div>
    </main>
  );
}
