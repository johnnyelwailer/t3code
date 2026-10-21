import { DEFAULT_SERVER_SETTINGS } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { applyServerSettingsPatch } from "./serverSettings.ts";

describe("voice transcriber settings", () => {
  it("defaults to an automatic model with detection and automatic language and the de,en picker list", () => {
    expect(DEFAULT_SERVER_SETTINGS.voice.transcriber).toEqual({
      model: "",
      modelPath: "",
      language: "auto",
      languages: "de,en",
      silenceMs: 1500,
    });
  });

  it("patches one field without resetting the others, and an empty modelPath clears it", () => {
    const withPath = applyServerSettingsPatch(DEFAULT_SERVER_SETTINGS, {
      voice: { transcriber: { modelPath: "E:/models/ggml-largev3.bin", language: "de" } },
    });
    expect(withPath.voice.transcriber).toEqual({
      model: "",
      modelPath: "E:/models/ggml-largev3.bin",
      language: "de",
      languages: "de,en",
      silenceMs: 1500,
    });

    const cleared = applyServerSettingsPatch(withPath, {
      voice: { transcriber: { modelPath: "" } },
    });
    expect(cleared.voice.transcriber).toMatchObject({ modelPath: "", language: "de" });
  });

  it("patches the picker list on its own, and an empty list is allowed", () => {
    const extended = applyServerSettingsPatch(DEFAULT_SERVER_SETTINGS, {
      voice: { transcriber: { languages: "de,en,fr" } },
    });
    expect(extended.voice.transcriber).toMatchObject({ language: "auto", languages: "de,en,fr" });
    const emptied = applyServerSettingsPatch(extended, {
      voice: { transcriber: { languages: "" } },
    });
    expect(emptied.voice.transcriber.languages).toBe("");
  });
});
