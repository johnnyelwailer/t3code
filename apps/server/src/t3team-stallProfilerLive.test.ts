import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, assert, it } from "@effect/vitest";
import { replaceFeatureFlagPresetValues } from "@t3tools/project-context/t3teamFeatureFlags";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as ServerConfig from "./config.ts";
import * as FeatureFlags from "./t3team-FeatureFlags.ts";
import type { StallProfilerOptions } from "./t3team-stallProfiler.ts";
import { makeT3TeamStallProfilerLive } from "./t3team-stallProfilerLive.ts";

afterEach(() => replaceFeatureFlagPresetValues(new Map()));

const recordingProfiler = () => {
  const started: StallProfilerOptions[] = [];
  let stopped = 0;
  const start = (options: StallProfilerOptions) => {
    started.push(options);
    return { stop: () => void (stopped += 1) };
  };
  return { start, started, stopped: () => stopped };
};

const runServerLifetime = (start: ReturnType<typeof recordingProfiler>["start"]) =>
  Layer.build(makeT3TeamStallProfilerLive(start)).pipe(
    Effect.scoped,
    Effect.provide(
      Layer.mergeAll(
        Layer.mock(FeatureFlags.FeatureFlags)({}),
        ServerConfig.layerTest(process.cwd(), { prefix: "t3-stall-profiler-live-" }).pipe(
          Layer.provide(NodeServices.layer),
        ),
      ),
    ),
  );

it.effect("starts no profiler while OPS_STALL_PROFILER is off", () =>
  Effect.gen(function* () {
    replaceFeatureFlagPresetValues(new Map([["OPS_STALL_PROFILER", false]]));
    const profiler = recordingProfiler();
    yield* runServerLifetime(profiler.start);
    assert.lengthOf(profiler.started, 0);
  }),
);

it.effect("profiles into the logs directory while on, and stops with the server", () =>
  Effect.gen(function* () {
    replaceFeatureFlagPresetValues(new Map([["OPS_STALL_PROFILER", true]]));
    const profiler = recordingProfiler();
    yield* runServerLifetime(profiler.start);
    assert.lengthOf(profiler.started, 1);
    assert.match(profiler.started[0]!.directory, /logs[\\/]stalls$/);
    assert.strictEqual(profiler.stopped(), 1);
  }),
);
