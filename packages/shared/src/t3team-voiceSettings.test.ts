import { DEFAULT_SERVER_SETTINGS } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { applyServerSettingsPatch } from "./serverSettings.ts";

describe("voice transcriber settings", () => {
  it("defaults to large-v3-turbo with detection and automatic language", () => {
    expect(DEFAULT_SERVER_SETTINGS.voice.transcriber).toEqual({
      model: "large-v3-turbo",
      modelPath: "",
      language: "auto",
    });
  });

  it("patches one field without resetting the others, and an empty modelPath clears it", () => {
    const withPath = applyServerSettingsPatch(DEFAULT_SERVER_SETTINGS, {
      voice: { transcriber: { modelPath: "E:/models/ggml-largev3.bin", language: "de" } },
    });
    expect(withPath.voice.transcriber).toEqual({
      model: "large-v3-turbo",
      modelPath: "E:/models/ggml-largev3.bin",
      language: "de",
    });

    const cleared = applyServerSettingsPatch(withPath, {
      voice: { transcriber: { modelPath: "" } },
    });
    expect(cleared.voice.transcriber).toMatchObject({ modelPath: "", language: "de" });
  });
});
