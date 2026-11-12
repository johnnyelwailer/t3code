import { describe, expect, it } from "vite-plus/test";

import {
  languagesToRetry,
  parseAllowedLanguages,
  pickBestTranscript,
  scoreTranscript,
} from "./t3team-voiceLanguageChoice.ts";

describe("voice language choice", () => {
  it("parses the allowed list", () => {
    expect(parseAllowedLanguages(" DE, en ,x1,")).toEqual(["de", "en"]);
    expect(parseAllowedLanguages(undefined)).toEqual([]);
  });

  it("scores like the Activity Tracker: letters plus five per word", () => {
    expect(scoreTranscript("Hallo Welt")).toBe(9 + 10);
    expect(scoreTranscript("  ")).toBe(0);
    expect(scoreTranscript("Grüezi")).toBe(6 + 5);
  });

  it("re-runs only an auto-detected language outside a non-empty list, however short", () => {
    const allowed = ["de", "en"];
    const retry = (requestedLanguage: string, detectedLanguage: string | undefined) =>
      languagesToRetry({ requestedLanguage, detectedLanguage, allowedLanguages: allowed });
    expect(retry("auto", "ar")).toEqual(["de", "en"]);
    expect(retry("auto", "DE")).toEqual([]);
    expect(retry("de", "ar")).toEqual([]);
    expect(retry("auto", undefined)).toEqual([]);
    expect(
      languagesToRetry({ requestedLanguage: "auto", detectedLanguage: "pt", allowedLanguages: [] }),
    ).toEqual([]);
  });

  it("keeps the fullest transcript, the first on a tie", () => {
    const de = { text: "Ich öffne das Board", language: "de" };
    const en = { text: "Ish", language: "en" };
    expect(pickBestTranscript([de, en])).toBe(de);
    expect(pickBestTranscript([en, de])).toBe(de);
    expect(
      pickBestTranscript([
        { text: "a", language: "de" },
        { text: "b", language: "en" },
      ])?.language,
    ).toBe("de");
    expect(pickBestTranscript([])).toBeUndefined();
  });
});
