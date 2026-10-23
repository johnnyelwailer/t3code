import { assert, describe, it } from "@effect/vitest";
import { replaceFeatureFlagPresetValues } from "@t3tools/project-context/t3teamFeatureFlags";
import * as Effect from "effect/Effect";
import { afterEach } from "vite-plus/test";

import { isMcpToolEnabled, whenMcpToolEnabled } from "./t3team-mcpToolFeatureGate.ts";

const WORKFLOW_TOOLS = [
  "t3_orchestration_run",
  "t3_orchestration_status",
  "t3_orchestration_resume",
  "t3_orchestration_pause",
  "t3_orchestration_stop",
] as const;
const RECIPE_TOOLS = ["t3_recipe_list", "t3_recipe_validate"] as const;

describe("workflow and recipe MCP tools behind their flags", () => {
  afterEach(() => replaceFeatureFlagPresetValues(new Map()));

  it("are listed by default and dropped while their flag is off", () => {
    for (const tool of [...WORKFLOW_TOOLS, ...RECIPE_TOOLS]) {
      assert.isTrue(isMcpToolEnabled(tool), tool);
    }
    replaceFeatureFlagPresetValues(new Map([["AGENTS_ORCHESTRATION_TOOLS", false]]));
    for (const tool of WORKFLOW_TOOLS) assert.isFalse(isMcpToolEnabled(tool), tool);
    for (const tool of RECIPE_TOOLS) assert.isTrue(isMcpToolEnabled(tool), tool);

    replaceFeatureFlagPresetValues(new Map([["ORCHESTRATION_RECIPES", false]]));
    for (const tool of RECIPE_TOOLS) assert.isFalse(isMcpToolEnabled(tool), tool);
    for (const tool of WORKFLOW_TOOLS) assert.isTrue(isMcpToolEnabled(tool), tool);
  });

  it.effect("refuse a call from an older tool list while the flag is off", () =>
    Effect.gen(function* () {
      replaceFeatureFlagPresetValues(new Map([["AGENTS_ORCHESTRATION_TOOLS", false]]));
      const calls: string[] = [];
      const handler = whenMcpToolEnabled("t3_orchestration_run", (input: string) =>
        Effect.sync(() => calls.push(input)),
      );
      const failure = yield* Effect.flip(handler("recipe-1"));
      assert.include(failure.message, "Settings → Features → Workflow tools");
      assert.deepEqual(calls, []);

      replaceFeatureFlagPresetValues(new Map([["AGENTS_ORCHESTRATION_TOOLS", true]]));
      yield* handler("recipe-1");
      assert.deepEqual(calls, ["recipe-1"]);
    }),
  );
});
