/** Top-level sections of Settings → Features, in display order. */
export const FEATURE_FLAG_GROUPS = [
  "Agent",
  "Work items",
  "My Work",
  "Integrations",
  "Cloud & machines",
  "Orchestration",
  "UI & rendering",
  "Platform",
  "Ops",
] as const;
export type FeatureFlagGroup = (typeof FEATURE_FLAG_GROUPS)[number];

/** `vendor`: registered by this host. `pack`: contributed by an installed pack at activation. */
export type FeatureFlagScope = "vendor" | "pack";

/** Where a flag's effective value came from, highest precedence first. */
export type FeatureFlagSource = "env" | "user" | "preset" | "default";

export interface FeatureFlagDefinition {
  readonly group: FeatureFlagGroup;
  /** One nesting level below the group, e.g. "Planning space" under "Work items". */
  readonly subgroup?: string;
  readonly label: string;
  /** What the flag turns on, and what remains when it is off. */
  readonly description: string;
  readonly defaultEnabled: boolean;
  readonly requiresRestart: boolean;
  /** Older env names, read after `NEXI_FF_<KEY>` so existing overrides keep working. */
  readonly envAliases?: ReadonlyArray<string>;
  /** False when a user value cannot take effect (read outside the server, or data-location
   * flags that must match the release). Env and release preset still apply. */
  readonly userToggleable?: boolean;
}

export interface RegisteredFeatureFlag extends FeatureFlagDefinition {
  readonly key: string;
  readonly scope: FeatureFlagScope;
  readonly envName: string;
}

export interface ResolvedFeatureFlag extends RegisteredFeatureFlag {
  readonly enabled: boolean;
  readonly source: FeatureFlagSource;
}

/** `agent.fff-search` → `NEXI_FF_AGENT_FFF_SEARCH`; `MAIN_REPOSITORY` → `NEXI_FF_MAIN_REPOSITORY`.
 * Matches the portal's `featureFlagEnvName`, so one key names one env override everywhere. */
export function featureFlagEnvName(key: string): string {
  return `NEXI_FF_${key.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
}
