import { describe, expect, it } from "vite-plus/test";

import { VOICE_TIER_MODEL, routeVoiceUtterance } from "./t3team-voiceRouting";

describe("routeVoiceUtterance", () => {
  it("selects the Instant slug for control and the Fast slug for synthesis", () => {
    expect(VOICE_TIER_MODEL.control).toEqual({ instanceId: "nexplore", model: "no-thinking" });
    expect(VOICE_TIER_MODEL.synthesis).toEqual({ instanceId: "nexplore", model: "low" });
  });

  it("uses the tier the server classified", async () => {
    expect(await routeVoiceUtterance("stop it", async () => ({ tier: "control" }))).toEqual(
      VOICE_TIER_MODEL.control,
    );
    expect(await routeVoiceUtterance("what now", async () => ({ tier: "synthesis" }))).toEqual(
      VOICE_TIER_MODEL.synthesis,
    );
  });

  it("falls back to synthesis when the router is unreachable", async () => {
    const unreachable = () => Promise.reject(new Error("fetch failed"));
    expect(await routeVoiceUtterance("stop it", unreachable)).toEqual(VOICE_TIER_MODEL.synthesis);
  });
});
