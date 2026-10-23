import { assert, describe, it } from "@effect/vitest";
import { replaceFeatureFlagPresetValues } from "@t3tools/project-context/t3teamFeatureFlags";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { afterEach } from "vite-plus/test";

import { ProjectStoreV2 } from "./orchestration-v2/ProjectStore.ts";
import { WorkflowSignalStore } from "./persistence/WorkflowSignalStore.ts";
import {
  T3TeamRecipeTriggerRunner,
  T3TeamRecipeTriggerRunnerLive,
} from "./t3team-recipeTriggerRunner.ts";

/** Starts the runner and counts the project reads its initial reconcile made: the reconcile reads
 * the projects synchronously, before its first await. */
const reconcileReadsOnStart = Effect.gen(function* () {
  let projectReads = 0;
  const services = Layer.mergeAll(
    Layer.mock(ProjectStoreV2)({
      list: () =>
        Effect.sync(() => {
          projectReads += 1;
          return [];
        }),
    }),
    Layer.mock(WorkflowSignalStore)({ listTriggerRegistrations: () => Effect.succeed([]) }),
  );
  const runner = yield* T3TeamRecipeTriggerRunner.pipe(
    Effect.provide(T3TeamRecipeTriggerRunnerLive.pipe(Layer.provide(services))),
  );
  yield* runner.start();
  yield* runner.stop();
  return projectReads;
});

describe("recipe trigger runner behind ORCHESTRATION_RECIPE_TRIGGERS", () => {
  afterEach(() => replaceFeatureFlagPresetValues(new Map()));

  it.effect("does not reconcile triggers while the flag is off (the default)", () =>
    Effect.gen(function* () {
      assert.strictEqual(yield* reconcileReadsOnStart, 0);
    }),
  );

  it.effect("reconciles triggers once the flag is on", () =>
    Effect.gen(function* () {
      replaceFeatureFlagPresetValues(new Map([["ORCHESTRATION_RECIPE_TRIGGERS", true]]));
      assert.strictEqual(yield* reconcileReadsOnStart, 1);
    }),
  );
});
