/**
 * Runs the stall profiler (t3team-stallProfiler.ts) for the server's lifetime when
 * `OPS_STALL_PROFILER` is on. The flag is startup-only and its user value lives in the database,
 * so the profiler starts from a layer that waits for `FeatureFlags` rather than from the CLI entry,
 * which runs before any user value is loaded. The cost: a stall during boot, before the database
 * opens, is not profiled.
 */
import { readFeatureFlag } from "@t3tools/project-context/t3teamFeatureFlags";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { ServerConfig } from "./config.ts";
import * as FeatureFlags from "./t3team-FeatureFlags.ts";
import { activeResourceSummary } from "./t3team-processResilience.ts";
import { startStallProfiler } from "./t3team-stallProfiler.ts";

export const makeT3TeamStallProfilerLive = (
  start: typeof startStallProfiler = startStallProfiler,
) =>
  Layer.effectDiscard(
    Effect.gen(function* () {
      yield* FeatureFlags.FeatureFlags;
      if (!readFeatureFlag("OPS_STALL_PROFILER")) return;
      const config = yield* ServerConfig;
      // A stalled event loop drops every client with "stopped responding" and leaves no trace
      // of why; this writes a CPU profile of each stall next to the logs.
      const profiler = start({
        directory: `${config.logsDir}/stalls`,
        onStall: (event) =>
          Effect.runFork(
            Effect.logWarning("The server's event loop stalled", {
              ...event,
              activeResources: activeResourceSummary(),
            }),
          ),
        onUnavailable: (reason) =>
          Effect.runFork(Effect.logDebug("Stall profiler unavailable", { reason })),
      });
      yield* Effect.addFinalizer(() => Effect.sync(profiler.stop));
    }),
  );

export const T3TeamStallProfilerLive = makeT3TeamStallProfilerLive();
