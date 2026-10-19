/**
 * Starts child processes one at a time and lets the event loop run between them.
 *
 * `child_process.spawn` is synchronous up to process creation, and on Windows that costs
 * 10–400 ms per call (PATH search, environment block, antivirus hooks on CreateProcess). The
 * server fans out git and CLI work with high concurrency (a pull-request sweep looks up every
 * active thread at once), so dozens of spawns used to run back to back inside one macrotask and
 * held the loop for many seconds: HTTP and websocket stopped answering, and the desktop watchdog
 * killed a backend that was only busy (2026-10-19).
 *
 * Every spawn goes through one permit. After each spawn the permit stays held for a pause as long
 * as the spawn took (at least one timer turn, at most `maxPause`), so at least one I/O poll
 * phase runs between two spawns and a burst can spend at most about half of wall time creating
 * processes. Only process creation is paced; a started process runs and streams as before.
 *
 * @module t3team-pacedChildProcessSpawner
 */
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Semaphore from "effect/Semaphore";
import {
  ChildProcessSpawner,
  make as makeChildProcessSpawner,
} from "effect/process/ChildProcessSpawner";

export interface SpawnPacingConfig {
  readonly minPause: Duration.Duration;
  readonly maxPause: Duration.Duration;
}

const DEFAULT_SPAWN_PACING_CONFIG: SpawnPacingConfig = {
  minPause: Duration.millis(1),
  maxPause: Duration.millis(100),
};

/** The pause after a spawn that took `elapsed`: as long as the spawn, within the bounds. */
const pauseAfterSpawn = (
  elapsed: Duration.Duration,
  config: SpawnPacingConfig,
): Duration.Duration =>
  Duration.clamp(elapsed, { minimum: config.minPause, maximum: config.maxPause });

export interface SpawnPacer {
  readonly pace: <A, E, R>(spawn: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>;
}

export const makeSpawnPacer = (
  config: SpawnPacingConfig = DEFAULT_SPAWN_PACING_CONFIG,
): Effect.Effect<SpawnPacer> =>
  Effect.map(Semaphore.make(1), (permit) => ({
    pace: (spawn) =>
      permit.withPermits(1)(
        Effect.timed(Effect.exit(spawn)).pipe(
          Effect.flatMap(([elapsed, exit]) =>
            Effect.sleep(pauseAfterSpawn(elapsed, config)).pipe(Effect.andThen(exit)),
          ),
        ),
      ),
  }));

/** Wraps a spawner so all of its process creation goes through one pacer. */
const pacedChildProcessSpawner = (
  inner: ChildProcessSpawner["Service"],
  pacer: SpawnPacer,
): ChildProcessSpawner["Service"] =>
  makeChildProcessSpawner((command) => pacer.pace(inner.spawn(command)));

/** Replaces the `ChildProcessSpawner` it is provided with by a paced one. */
export const layer = (
  config: SpawnPacingConfig = DEFAULT_SPAWN_PACING_CONFIG,
): Layer.Layer<ChildProcessSpawner, never, ChildProcessSpawner> =>
  Layer.effect(
    ChildProcessSpawner,
    Effect.gen(function* () {
      const inner = yield* ChildProcessSpawner;
      const pacer = yield* makeSpawnPacer(config);
      return pacedChildProcessSpawner(inner, pacer);
    }),
  );
