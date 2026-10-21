import { describe, expect, it } from "vite-plus/test";

import { voiceModelProgressPercent, voicePreparingLabel } from "./t3team-voiceModelProgress";

describe("voiceModelProgressPercent", () => {
  it("rounds received over total to a whole percent", () => {
    expect(voiceModelProgressPercent({ receivedBytes: 430, totalBytes: 1000 })).toBe(43);
    expect(voiceModelProgressPercent({ receivedBytes: 1, totalBytes: 3 })).toBe(33);
  });

  it("clamps overshoot and negatives into 0-100", () => {
    expect(voiceModelProgressPercent({ receivedBytes: 1500, totalBytes: 1000 })).toBe(100);
    expect(voiceModelProgressPercent({ receivedBytes: -5, totalBytes: 1000 })).toBe(0);
  });

  it("has no percent while the total is unknown or unusable", () => {
    expect(voiceModelProgressPercent({ receivedBytes: 10, totalBytes: null })).toBeNull();
    expect(voiceModelProgressPercent({ receivedBytes: 10, totalBytes: 0 })).toBeNull();
    expect(voiceModelProgressPercent({ receivedBytes: Number.NaN, totalBytes: 100 })).toBeNull();
  });
});

describe("voicePreparingLabel", () => {
  it("names the model download with its percent", () => {
    expect(voicePreparingLabel(43)).toBe("Preparing voice model — 43%");
    expect(voicePreparingLabel(0)).toBe("Preparing voice model — 0%");
  });

  it("stays generic when there is no download progress", () => {
    expect(voicePreparingLabel(null)).toBe("Preparing voice input");
  });
});
