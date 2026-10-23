/**
 * Feature flags as a server service: loads user values at start (built before every flag-gated
 * service), answers Settings → Features, applies a user value, and streams effective values so
 * clients re-gate live. Installed packs read their flags in-process from `T3TEAM_PACK_FLAGS`,
 * which this service keeps current.
 */
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import type * as Scope from "effect/Scope";
import * as SqlClient from "effect/sql/SqlClient";
import * as Stream from "effect/Stream";
import type {
  FeatureFlagSetError,
  FeatureFlagSetInput,
  FeatureFlagsView,
  FeatureFlagValues,
} from "@t3tools/contracts";
import {
  FEATURE_FLAG_GROUPS,
  currentFeatureFlagPresetName,
  resolveFeatureFlags,
  type ResolvedFeatureFlag,
} from "@t3tools/project-context/t3teamFeatureFlags";
import { initializeFeatureFlags, setFeatureFlag } from "./t3team-featureFlagStore.ts";

/** JSON `{ [packFlagKey]: boolean }`, read by packs after their own `NEXI_FF_<KEY>` override. */
export const PACK_FEATURE_FLAGS_ENV = "T3TEAM_PACK_FLAGS";

export class FeatureFlags extends Context.Service<
  FeatureFlags,
  {
    readonly view: Effect.Effect<FeatureFlagsView>;
    readonly values: Effect.Effect<FeatureFlagValues>;
    readonly set: (
      input: FeatureFlagSetInput,
    ) => Effect.Effect<FeatureFlagsView, FeatureFlagSetError>;
    /** Subscribe before reading the snapshot, so a change in between still arrives. */
    readonly subscribeChanges: Effect.Effect<Stream.Stream<FeatureFlagValues>, never, Scope.Scope>;
  }
>()("t3/t3team-FeatureFlags/FeatureFlags") {}

const valuesOf = (flags: ReadonlyArray<ResolvedFeatureFlag>): FeatureFlagValues =>
  Object.fromEntries(flags.map((flag) => [flag.key, flag.enabled]));

function exportPackFlagSnapshot(flags: ReadonlyArray<ResolvedFeatureFlag>): void {
  process.env[PACK_FEATURE_FLAGS_ENV] = JSON.stringify(
    valuesOf(flags.filter((flag) => flag.scope === "pack")),
  );
}

function toView(
  flags: ReadonlyArray<ResolvedFeatureFlag>,
  startup: ReadonlyMap<string, boolean>,
): FeatureFlagsView {
  const preset = currentFeatureFlagPresetName();
  return {
    groups: [...FEATURE_FLAG_GROUPS],
    flags: flags.map((flag) => ({
      key: flag.key,
      group: flag.group,
      ...(flag.subgroup === undefined ? {} : { subgroup: flag.subgroup }),
      label: flag.label,
      description: flag.description,
      scope: flag.scope,
      enabled: flag.enabled,
      source: flag.source,
      envName: flag.envName,
      requiresRestart: flag.requiresRestart,
      restartPending: flag.requiresRestart && startup.get(flag.key) !== flag.enabled,
      userToggleable: flag.userToggleable !== false,
    })),
    ...(preset === undefined ? {} : { preset }),
  };
}

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  // A broken flag table must not keep the host from starting: env, preset and code defaults
  // still decide every flag.
  yield* initializeFeatureFlags().pipe(
    Effect.catch((cause) =>
      Effect.logWarning("Feature flag user values could not be loaded", { cause }),
    ),
  );
  const startupFlags = resolveFeatureFlags();
  const startup = new Map(startupFlags.map((flag) => [flag.key, flag.enabled]));
  exportPackFlagSnapshot(startupFlags);
  const changes = yield* PubSub.unbounded<FeatureFlagValues>();

  const set = Effect.fn("FeatureFlags.set")(function* (input: FeatureFlagSetInput) {
    yield* setFeatureFlag(input.key, input.enabled).pipe(
      Effect.provideService(SqlClient.SqlClient, sql),
    );
    const flags = resolveFeatureFlags();
    exportPackFlagSnapshot(flags);
    yield* PubSub.publish(changes, valuesOf(flags));
    return toView(flags, startup);
  });

  return FeatureFlags.of({
    view: Effect.sync(() => toView(resolveFeatureFlags(), startup)),
    values: Effect.sync(() => valuesOf(resolveFeatureFlags())),
    set,
    subscribeChanges: PubSub.subscribe(changes).pipe(Effect.map(Stream.fromSubscription)),
  });
});

export const layer = Layer.effect(FeatureFlags, make);
