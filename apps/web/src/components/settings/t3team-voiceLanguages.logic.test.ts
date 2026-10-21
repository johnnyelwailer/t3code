import { describe, expect, it } from "vite-plus/test";

import {
  formatVoiceLanguages,
  parseVoiceLanguages,
  voiceLanguageLabel,
  voiceLanguageOptions,
} from "./t3team-voiceLanguages.logic";

describe("parseVoiceLanguages", () => {
  it("trims, lowercases and drops empty entries, repeats and auto", () => {
    expect(parseVoiceLanguages(" DE, en ,, fr ,de,Auto, ")).toEqual(["de", "en", "fr"]);
  });

  it("returns nothing for an empty or blank list", () => {
    expect(parseVoiceLanguages("")).toEqual([]);
    expect(parseVoiceLanguages(" , ,")).toEqual([]);
  });

  it("round-trips through the saved form", () => {
    const saved = formatVoiceLanguages(" EN ,, de");
    expect(saved).toBe("en,de");
    expect(formatVoiceLanguages(saved)).toBe(saved);
  });
});

describe("voiceLanguageLabel", () => {
  it("names a language in itself", () => {
    expect(voiceLanguageLabel("de")).toBe("Deutsch");
    expect(voiceLanguageLabel("en")).toBe("English");
  });

  it("falls back to the code for what it cannot name", () => {
    expect(voiceLanguageLabel("zz")).toBe("zz");
    expect(voiceLanguageLabel("not a code!")).toBe("not a code!");
  });
});

describe("voiceLanguageOptions", () => {
  it("puts Auto first and keeps the configured order", () => {
    expect(voiceLanguageOptions("en,de", "auto").map((option) => option.value)).toEqual([
      "auto",
      "en",
      "de",
    ]);
  });

  it("keeps a pinned language selectable when the list no longer has it", () => {
    expect(voiceLanguageOptions("de", "FR").map((option) => option.value)).toEqual([
      "auto",
      "de",
      "fr",
    ]);
  });
});
