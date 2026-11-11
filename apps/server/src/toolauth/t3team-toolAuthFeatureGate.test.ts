import { assert, describe, it } from "@effect/vitest";
import { replaceFeatureFlagPresetValues } from "@t3tools/project-context/t3teamFeatureFlags";
import * as Effect from "effect/Effect";
import { afterEach } from "vite-plus/test";

import { whenToolAuthFlowEnabled } from "./t3team-toolAuthFeatureGate.ts";
import type { AuthState } from "./t3team-types.ts";

const started = (tool: string) => {
  const runs: string[] = [];
  const published: AuthState[] = [];
  const flow = Effect.sync((): AuthState => {
    runs.push(tool);
    return { tool, phase: "starting" };
  });
  const publish = (state: AuthState) =>
    Effect.sync(() => {
      published.push(state);
    });
  return { runs, published, flow: whenToolAuthFlowEnabled(tool, flow, { publish }) };
};

describe("whenToolAuthFlowEnabled", () => {
  afterEach(() => replaceFeatureFlagPresetValues(new Map()));

  it.effect("refuses a Connected tools sign-in without spawning it while the card is off", () =>
    Effect.gen(function* () {
      replaceFeatureFlagPresetValues(new Map([["INTEGRATIONS_TOOL_AUTH", false]]));
      const { runs, published, flow } = started("claude");
      const state = yield* flow;
      assert.equal(state.phase, "failed");
      assert.include(state.message ?? "", "CLI tool sign-in is turned off");
      assert.deepEqual(runs, []);

      // The refusal is a success value, so a card that reads only the status stream would sit at
      // `idle` and make the click look ignored unless the gate also publishes it.
      assert.deepEqual(published, [state]);
      assert.equal(state.reason, "featureDisabled");
    }),
  );

  it.effect("publishes nothing when the flow is allowed to run", () =>
    Effect.gen(function* () {
      replaceFeatureFlagPresetValues(new Map([["INTEGRATIONS_TOOL_AUTH", true]]));
      const { published, flow } = started("claude");
      yield* flow;
      assert.deepEqual(published, []);
    }),
  );

  it.effect("keeps the shared gh sign-in open while the card is off", () =>
    Effect.gen(function* () {
      replaceFeatureFlagPresetValues(new Map([["INTEGRATIONS_TOOL_AUTH", false]]));
      const { runs, flow } = started("gh");
      assert.equal((yield* flow).phase, "starting");
      assert.deepEqual(runs, ["gh"]);
    }),
  );

  it.effect("runs the flow once the card is on", () =>
    Effect.gen(function* () {
      replaceFeatureFlagPresetValues(new Map([["INTEGRATIONS_TOOL_AUTH", true]]));
      const { runs, flow } = started("codex");
      assert.equal((yield* flow).phase, "starting");
      assert.deepEqual(runs, ["codex"]);
    }),
  );
});
