import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  clearPackFeatureFlags,
  resolveFeatureFlag,
} from "@t3tools/project-context/t3teamFeatureFlags";

import { registerPackFeatureFlagDefinitions } from "./t3team-pack-featureFlags.ts";

const definition = {
  key: "agent.auto-classifier",
  group: "Agent",
  subgroup: "Nexplore AI",
  label: "Auto permission mode",
  description: "An LLM classifier decides which tool calls run without asking.",
  defaultEnabled: false,
  requiresRestart: false,
};

afterEach(() => clearPackFeatureFlags());

describe("registerPackFeatureFlagDefinitions", () => {
  it("lists a pack flag under its host group", () => {
    registerPackFeatureFlagDefinitions([definition]);
    expect(resolveFeatureFlag("agent.auto-classifier", () => undefined)).toMatchObject({
      scope: "pack",
      group: "Agent",
      subgroup: "Nexplore AI",
      envName: "NEXI_FF_AGENT_AUTO_CLASSIFIER",
      enabled: false,
      source: "default",
    });
  });

  it("rejects a key the page cannot address and a group it cannot place", () => {
    expect(() =>
      registerPackFeatureFlagDefinitions([{ ...definition, key: "AutoClassifier" }]),
    ).toThrow(/lowercase/);
    expect(() => registerPackFeatureFlagDefinitions([{ ...definition, group: "Misc" }])).toThrow(
      /unknown group/,
    );
  });
});
