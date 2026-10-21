import { describe, expect, it } from "vite-plus/test";

import { defaultWhisperModelFor } from "./t3team-whisperDefaultModel.ts";

describe("defaultWhisperModelFor", () => {
  it.each([
    ["discrete", "large-v3-turbo"],
    ["integrated", "base"],
    ["cpu", "base"],
  ] as const)("a %s device defaults to %s", (kind, model) => {
    expect(defaultWhisperModelFor(kind)).toBe(model);
  });
});
