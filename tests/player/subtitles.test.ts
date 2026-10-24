import { describe, expect, it } from "vitest";
import { isVtt, normalizeLang, srtToVtt } from "@/lib/player/subtitles";

describe("srtToVtt", () => {
  it("converts SRT with BOM, CRLF, indexes and multi-line cues", () => {
    const srt = "﻿1\r\n00:00:01,000 --> 00:00:02,500\r\nHello\r\n<i>world</i>\r\n\r\n2\r\n01:02:03,04 --> 01:02:05,000\r\n{\\an8}Top line\r\n";
    expect(srtToVtt(srt)).toBe(
      "WEBVTT\n\n00:00:01.000 --> 00:00:02.500\nHello\n<i>world</i>\n\n01:02:03.040 --> 01:02:05.000\nTop line\n",
    );
  });

  it("skips empty and junk blocks", () => {
    const srt = "garbage\n\n1\n00:00:01,000 --> 00:00:02,000\n\n\n2\n00:00:03,000 --> 00:00:04,000\nOk\n";
    expect(srtToVtt(srt)).toBe("WEBVTT\n\n00:00:03.000 --> 00:00:04.000\nOk\n");
  });

  it("passes VTT through (normalising line endings)", () => {
    expect(srtToVtt("WEBVTT\r\n\r\n00:00.000 --> 00:01.000\r\nHi\r\n")).toBe("WEBVTT\n\n00:00.000 --> 00:01.000\nHi\n");
  });

  it("rejects files with no cues", () => {
    expect(() => srtToVtt("just some text")).toThrow(/No subtitles/);
  });
});

describe("helpers", () => {
  it("detects VTT", () => {
    expect(isVtt("WEBVTT\n")).toBe(true);
    expect(isVtt("﻿WEBVTT - title\n")).toBe(true);
    expect(isVtt("1\n00:00")).toBe(false);
  });

  it("normalises language codes", () => {
    expect(normalizeLang(" EN ")).toBe("en");
    expect(normalizeLang("pt_BR")).toBe("pt-br");
    expect(normalizeLang("english")).toBeUndefined();
    expect(normalizeLang("../x")).toBeUndefined();
  });
});
