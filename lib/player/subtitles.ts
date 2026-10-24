/** Subtitle helpers. Browsers only play WebVTT, so SRT files are converted on the way in. */

export type SubtitleTrack = { lang: string; label: string; key: string };

/** Common languages offered in the "Add subtitles" picker. */
export const LANGUAGES: Record<string, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  it: "Italiano",
  pt: "Português",
  nl: "Nederlands",
  pl: "Polski",
  ru: "Русский",
  uk: "Українська",
  zh: "中文",
  ja: "日本語",
  ko: "한국어",
  ar: "العربية",
  he: "עברית",
  hi: "हिन्दी",
};

/** Lowercase BCP-47-ish code ("en", "pt-br"), or undefined if it doesn't look like one. */
export function normalizeLang(input: string): string | undefined {
  const code = input.trim().toLowerCase().replace(/_/g, "-");
  return /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/.test(code) ? code : undefined;
}

export function isVtt(text: string): boolean {
  return /^﻿?WEBVTT(\s|$)/.test(text);
}

const SRT_TIME = /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/g;

/**
 * Convert SubRip (.srt) to WebVTT. Handles a BOM, Windows line endings,
 * comma decimal separators, numeric cue indexes and stray blank lines.
 * Basic tags (<i>, <b>, <u>) are valid in VTT and kept; {\an8}-style
 * positioning codes are dropped.
 */
export function srtToVtt(input: string): string {
  if (isVtt(input)) return input.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const text = input.replace(/^﻿/, "").replace(/\r\n?/g, "\n").trim();
  const cues: string[] = [];
  for (const block of text.split(/\n{2,}/)) {
    const lines = block.split("\n");
    const timeIndex = lines.findIndex((l) => l.includes("-->"));
    if (timeIndex === -1) continue;
    const timing = lines[timeIndex]!.replace(SRT_TIME, (_, h, m, s, ms) =>
      `${h.padStart(2, "0")}:${m}:${s}.${ms.padEnd(3, "0")}`,
    );
    const body = lines
      .slice(timeIndex + 1)
      .map((l) => l.replace(/\{\\[^}]*\}/g, ""))
      .join("\n")
      .trim();
    if (body) cues.push(`${timing.trim()}\n${body}`);
  }
  if (!cues.length) throw new Error("No subtitles found in this file");
  return `WEBVTT\n\n${cues.join("\n\n")}\n`;
}
