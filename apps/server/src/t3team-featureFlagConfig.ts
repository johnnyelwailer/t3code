/**
 * A host flag read through Effect's `Config`, for code that already takes its environment from
 * the active `ConfigProvider` (cloud sessions, the broker): the flag's `NEXI_FF_<KEY>` and its
 * aliases come from that provider, the user value, release preset and code default from the
 * registry, so a test's provider and the process env decide the same way.
 */
import {
  findFeatureFlag,
  readFeatureFlag,
  type FeatureFlagKey,
} from "@t3tools/project-context/t3teamFeatureFlags";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

export const readFeatureFlagFromConfig = Effect.fn("featureFlags.readFromConfig")(function* (
  key: FeatureFlagKey,
) {
  const flag = findFeatureFlag(key);
  const envNames = flag === undefined ? [] : [flag.envName, ...(flag.envAliases ?? [])];
  const values = new Map<string, string>();
  for (const name of envNames) {
    // A malformed value is indistinguishable from "unset": both leave the decision to the registry.
    const raw = yield* Effect.option(Config.String(name));
    if (Option.isSome(raw)) values.set(name, raw.value);
  }
  return readFeatureFlag(key, (name) => values.get(name));
});
