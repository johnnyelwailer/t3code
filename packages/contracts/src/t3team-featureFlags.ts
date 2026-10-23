/**
 * Settings → Features: every registered feature flag (host and pack) with its effective value
 * and where that value came from. Layering: env `NEXI_FF_<KEY>` > user value > release preset >
 * code default. The registry metadata is the only source of what the page lists.
 */
import * as Schema from "effect/Schema";

export const FeatureFlagScope = Schema.Literals(["vendor", "pack"]);
export type FeatureFlagScope = typeof FeatureFlagScope.Type;

export const FeatureFlagSource = Schema.Literals(["env", "user", "preset", "default"]);
export type FeatureFlagSource = typeof FeatureFlagSource.Type;

export const FeatureFlagView = Schema.Struct({
  key: Schema.String,
  group: Schema.String,
  subgroup: Schema.optionalKey(Schema.String),
  label: Schema.String,
  description: Schema.String,
  scope: FeatureFlagScope,
  enabled: Schema.Boolean,
  source: FeatureFlagSource,
  envName: Schema.String,
  requiresRestart: Schema.Boolean,
  /** The value differs from the one this process started with and only applies after restart. */
  restartPending: Schema.Boolean,
  /** False: only env and the release preset decide (the switch is shown read-only). */
  userToggleable: Schema.Boolean,
});
export type FeatureFlagView = typeof FeatureFlagView.Type;

export const FeatureFlagsView = Schema.Struct({
  /** Section order for the page; flags carry their own group. */
  groups: Schema.Array(Schema.String),
  flags: Schema.Array(FeatureFlagView),
  /** The release flavor whose preset is installed, e.g. `nightly-dogfood`. */
  preset: Schema.optionalKey(Schema.String),
});
export type FeatureFlagsView = typeof FeatureFlagsView.Type;

export const FeatureFlagSetInput = Schema.Struct({
  key: Schema.String,
  /** `null` removes the user value, so the preset or code default applies again. */
  enabled: Schema.NullOr(Schema.Boolean),
});
export type FeatureFlagSetInput = typeof FeatureFlagSetInput.Type;

export class FeatureFlagSetError extends Schema.TaggedError<FeatureFlagSetError>()(
  "FeatureFlagSetError",
  {
    key: Schema.String,
    category: Schema.Literals(["unknown", "locked", "persistence"]),
    cause: Schema.optional(Schema.Defect()),
  },
) {
  override get message(): string {
    switch (this.category) {
      case "unknown":
        return `No feature flag named ${this.key}.`;
      case "locked":
        return `${this.key} is set by the release and cannot be changed here.`;
      case "persistence":
        return `Could not save ${this.key}.`;
    }
  }
}

/** Effective values only, keyed by flag; the client reads gates from this map. */
export const FeatureFlagValues = Schema.Record(Schema.String, Schema.Boolean);
export type FeatureFlagValues = typeof FeatureFlagValues.Type;
