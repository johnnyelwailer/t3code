import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import type * as Scope from "effect/Scope";

import { forkParked, ServerActivation } from "./serverActivation.ts";

/**
 * On Windows each `spawn` blocks the event loop while the process is created. A boot that released
 * PR sync, settlement and storage sweeps together stalled it for 25s and failed the desktop's first
 * session read with HTTP 500, so process- and scan-heavy housekeeping waits this long.
 */
export const HOUSEKEEPING_STARTUP_GRACE = Duration.seconds(45);

/** Like `forkParked`; a server with an activation gate also holds `effect` for the startup grace. */
export const forkParkedHousekeeping: <A, E, R>(
  effect: Effect.Effect<A, E, R>,
) => Effect.Effect<void, never, Scope.Scope | R> = Effect.fn(
  "serverActivation.forkParkedHousekeeping",
)(function* <A, E, R>(effect: Effect.Effect<A, E, R>) {
  const activation = yield* ServerActivation;
  yield* forkParked(
    activation === undefined ? effect : Effect.delay(effect, HOUSEKEEPING_STARTUP_GRACE),
  );
});
