"use client";

import { useTheme } from "next-themes";
import { useCallback, useEffect, useState } from "react";

export type ReaderTheme = "light" | "sepia" | "dark";
export type ReaderSettings = {
  /** Percent of the book's default size, 80–200. */
  fontSize: number;
  theme: ReaderTheme;
  font: "serif" | "sans";
  layout: "pages" | "scroll";
};

const KEY = "reader-settings";

/** Colours shared by the EPUB themes and the reader chrome. */
export const READER_COLORS: Record<ReaderTheme, { bg: string; fg: string }> = {
  light: { bg: "#ffffff", fg: "#1c1917" },
  sepia: { bg: "#f4ecd8", fg: "#5b4636" },
  dark: { bg: "#18181b", fg: "#e7e5e4" },
};

/** Per-device reader preferences, kept in localStorage. Theme defaults to the app's. */
export function useReaderSettings() {
  const { resolvedTheme } = useTheme();
  const [settings, setSettings] = useState<ReaderSettings>({
    fontSize: 100,
    theme: "light",
    font: "serif",
    layout: "pages",
  });

  useEffect(() => {
    let saved: Partial<ReaderSettings> = {};
    try {
      saved = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    } catch {}
    setSettings((s) => ({ ...s, theme: resolvedTheme === "dark" ? "dark" : "light", ...saved }));
  }, [resolvedTheme]);

  const update = useCallback((patch: Partial<ReaderSettings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch, fontSize: Math.min(200, Math.max(80, patch.fontSize ?? s.fontSize)) };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  return { settings, update };
}
