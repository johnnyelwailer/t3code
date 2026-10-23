/**
 * Gates a reactor's unit of work (one event, one scheduler tick) on a live feature flag. The flag
 * is read at each run, so a reactor started at boot follows a Settings → Features change without
 * a restart; while the flag is off every run is a no-op.
 */
import {
  readFeatureFlag,
  type FeatureFlagKey,
  type ReadFeatureFlagEnv,
} from "@t3tools/project-context/t3teamFeatureFlags";
import * as Effect from "effect/Effect";

export const whenFeatureEnabled = <E, R>(
  key: FeatureFlagKey,
  work: Effect.Effect<void, E, R>,
  readEnv?: ReadFeatureFlagEnv,
): Effect.Effect<void, E, R> =>
  Effect.suspend(() => (readFeatureFlag(key, readEnv) ? work : Effect.void));
