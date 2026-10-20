import { describe, expect, it } from "vite-plus/test";

import {
  VOICE_ROUTE_SYSTEM_PROMPT,
  classifyVoiceUtterance,
  parseVoiceTier,
  type VoiceRouteChat,
} from "./t3team-voiceRouting.ts";

describe("parseVoiceTier", () => {
  it.each(["control", "Control.", "  CONTROL\n", "control — spawn"])(
    "reads %j as control",
    (answer) => {
      expect(parseVoiceTier(answer)).toBe("control");
    },
  );

  it.each(["synthesis", "uncontrolled", "I think control", "", "maybe"])(
    "falls back to synthesis for %j",
    (answer) => {
      expect(parseVoiceTier(answer)).toBe("synthesis");
    },
  );
});

describe("classifyVoiceUtterance", () => {
  it("asks the Instant tier with the stable prefix first and the utterance last", async () => {
    const calls: Array<Parameters<VoiceRouteChat>[0]> = [];
    const tier = await classifyVoiceUtterance("stop the docs thread", async (request) => {
      calls.push(request);
      return "control";
    });
    expect(tier).toBe("control");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.model).toBe("no-thinking");
    expect(calls[0]?.messages).toEqual([
      { role: "system", content: VOICE_ROUTE_SYSTEM_PROMPT },
      { role: "user", content: "Utterance: stop the docs thread" },
    ]);
  });

  it("resolves a gateway failure to synthesis instead of failing the utterance", async () => {
    const tier = await classifyVoiceUtterance("stop the docs thread", async () => {
      throw new Error("gateway HTTP 503");
    });
    expect(tier).toBe("synthesis");
  });
});
