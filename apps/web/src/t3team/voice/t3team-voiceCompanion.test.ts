import { describe, expect, it } from "vite-plus/test";

import { voiceCompanionMood, voiceCompanionPreferences } from "./t3team-voiceCompanion";

describe("voiceCompanionMood", () => {
  it("maps every voice state to a companion mood, and idle to none", () => {
    expect(voiceCompanionMood("idle")).toBeNull();
    expect(voiceCompanionMood("preparing")).toBe("preparing");
    expect(voiceCompanionMood("recording")).toBe("listening");
    expect(voiceCompanionMood("transcribing")).toBe("transcribing");
    expect(voiceCompanionMood("committed")).toBe("heard");
    expect(voiceCompanionMood("failed")).toBe("failed");
    expect(voiceCompanionMood("denied")).toBe("failed");
  });
});

describe("voiceCompanionPreferences", () => {
  it("caps the overlay at low, keeps a cheaper ceiling and the on/off switch", () => {
    expect(voiceCompanionPreferences({ enabled: true, quality: "auto" }).quality).toBe("low");
    expect(voiceCompanionPreferences({ enabled: true, quality: "full" }).quality).toBe("low");
    expect(voiceCompanionPreferences({ enabled: true, quality: "minimal" }).quality).toBe(
      "minimal",
    );
    expect(voiceCompanionPreferences({ enabled: true, quality: "still" }).quality).toBe("still");
    expect(voiceCompanionPreferences({ enabled: false, quality: "auto" }).enabled).toBe(false);
  });
});
