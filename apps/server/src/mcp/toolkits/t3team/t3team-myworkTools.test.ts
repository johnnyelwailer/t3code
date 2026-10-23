import { assert, describe, it } from "@effect/vitest";
import { replaceFeatureFlagPresetValues } from "@t3tools/project-context/t3teamFeatureFlags";
import * as Effect from "effect/Effect";
import { afterEach } from "vite-plus/test";

import { isMcpToolEnabled, whenMcpToolEnabled } from "./t3team-mcpToolFeatureGate.ts";

const MY_WORK_TOOLS = ["t3_mywork_digest", "t3_mywork_arrange"] as const;

describe("My Work MCP tools behind MYWORK_DIGEST", () => {
  afterEach(() => replaceFeatureFlagPresetValues(new Map()));

  it("are listed by default and dropped while the digest is off", () => {
    for (const tool of MY_WORK_TOOLS) assert.isTrue(isMcpToolEnabled(tool), tool);
    replaceFeatureFlagPresetValues(new Map([["MYWORK_DIGEST", false]]));
    for (const tool of MY_WORK_TOOLS) assert.isFalse(isMcpToolEnabled(tool), tool);
  });

  it.effect("refuse a call from an older tool list while the digest is off", () =>
    Effect.gen(function* () {
      replaceFeatureFlagPresetValues(new Map([["MYWORK_DIGEST", false]]));
      const calls: string[] = [];
      const handler = whenMcpToolEnabled("t3_mywork_digest", (input: string) =>
        Effect.sync(() => calls.push(input)),
      );
      const failure = yield* Effect.flip(handler("project-1"));
      assert.include(failure.message, "t3_mywork_digest is turned off");
      assert.deepEqual(calls, []);

      replaceFeatureFlagPresetValues(new Map([["MYWORK_DIGEST", true]]));
      yield* handler("project-1");
      assert.deepEqual(calls, ["project-1"]);
    }),
  );
});
