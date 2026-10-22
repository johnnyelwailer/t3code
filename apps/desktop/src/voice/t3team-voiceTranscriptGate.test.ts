import { describe, expect, it } from "vite-plus/test";

import { gateTranscript, parseAllowedLanguages } from "./t3team-voiceTranscriptGate.ts";

const base = {
  requestedLanguage: "auto",
  allowedLanguages: ["de", "en"],
  audioMs: 4_000,
} as const;

describe("gateTranscript", () => {
  it("drops a pass VAD heard no speech in", () => {
    expect(gateTranscript({ ...base, text: "E aí", speechMs: 0 })).toEqual({
      kind: "drop",
      reason: "no-speech",
    });
  });

  it("drops a short pass detected outside the allowed languages as noise", () => {
    expect(gateTranscript({ ...base, text: "E aí", language: "pt", speechMs: 900 })).toEqual({
      kind: "drop",
      reason: "foreign-noise",
    });
  });

  it("re-runs real speech detected outside the list in the first allowed language", () => {
    expect(
      gateTranscript({ ...base, text: "lange Rede", language: "nl", speechMs: 3_000 }),
    ).toEqual({ kind: "retry", language: "de" });
  });

  it("leaves a pinned language alone and keeps allowed detections", () => {
    expect(
      gateTranscript({ ...base, requestedLanguage: "de", text: "Hallo", language: "pt" }),
    ).toEqual({ kind: "keep" });
    expect(gateTranscript({ ...base, text: "open the board", language: "en" })).toEqual({
      kind: "keep",
    });
  });

  it("drops a lone word out of a blip of speech but keeps a short real command", () => {
    const blip = { ...base, text: "Ja", language: "de", speechMs: 300 };
    expect(gateTranscript(blip)).toEqual({ kind: "drop", reason: "lone-word" });
    expect(gateTranscript({ ...blip, speechMs: 700 })).toEqual({ kind: "keep" });
  });

  it("parses the settings list and ignores junk entries", () => {
    expect(parseAllowedLanguages(" DE, en ,, x1 ")).toEqual(["de", "en"]);
    expect(parseAllowedLanguages(undefined)).toEqual([]);
  });
});
