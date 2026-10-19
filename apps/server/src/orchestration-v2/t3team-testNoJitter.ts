import * as Layer from "effect/Layer";
import * as Random from "effect/Random";

/**
 * Pins `Schedule.jittered` to its midpoint (a factor of exactly 1), so a test that advances the
 * TestClock by one interval still lands on the sweep it expects.
 */
export const noJitter = Layer.succeed(Random.Random, {
  nextIntUnsafe: () => 0,
  nextDoubleUnsafe: () => 0.5,
});

/** Pins `Schedule.jittered` to its earliest point (0.8x), so a test can see the jitter shorten a wait. */
export const earliestJitter = Layer.succeed(Random.Random, {
  nextIntUnsafe: () => 0,
  nextDoubleUnsafe: () => 0,
});
