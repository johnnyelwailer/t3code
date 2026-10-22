/** Runtime flags shared by the server, its startup adapter and the desktop shell. The registry is
 * the one metadata source for Settings → Features; installed packs add their own flags at
 * activation. Layering: `NEXI_FF_<KEY>` > user value (feature_flags row) > release preset > code
 * default. DB snapshots are installed by the feature_flags store after its transaction succeeds;
 * the preset is installed once at process start, before modules that freeze startup-only flags. */
import { AGENT_FEATURE_FLAG_DEFINITIONS } from "./t3team-featureFlagDefinitionsAgent.ts";
import { CORE_FEATURE_FLAG_DEFINITIONS } from "./t3team-featureFlagDefinitionsCore.ts";
import { WORK_FEATURE_FLAG_DEFINITIONS } from "./t3team-featureFlagDefinitionsWork.ts";
import {
  featureFlagEnvName,
  type FeatureFlagDefinition,
  type FeatureFlagSource,
  type RegisteredFeatureFlag,
  type ResolvedFeatureFlag,
} from "./t3team-featureFlagTypes.ts";

export * from "./t3team-featureFlagTypes.ts";

export const FEATURE_FLAG_DEFINITIONS = {
  ...CORE_FEATURE_FLAG_DEFINITIONS,
  ...WORK_FEATURE_FLAG_DEFINITIONS,
  ...AGENT_FEATURE_FLAG_DEFINITIONS,
};

export type FeatureFlagKey = keyof typeof FEATURE_FLAG_DEFINITIONS;
export type ReadFeatureFlagEnv = (key: string) => string | undefined;
export interface PackFeatureFlagDefinition extends FeatureFlagDefinition {
  readonly key: string;
}

const databaseValues = new Map<string, boolean>();
const presetValues = new Map<string, boolean>();
let presetName: string | undefined;
const packFlags = new Map<string, RegisteredFeatureFlag>();
const processEnv: ReadFeatureFlagEnv = (key) =>
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[key];

const vendorFlags: ReadonlyArray<RegisteredFeatureFlag> = Object.entries(
  FEATURE_FLAG_DEFINITIONS,
).map(([key, definition]: [string, FeatureFlagDefinition]) => ({
  key,
  scope: "vendor",
  envName: featureFlagEnvName(key),
  ...definition,
}));

const vendorFlagsByKey = new Map(vendorFlags.map((flag) => [flag.key, flag]));

function isVendorFlagKey(key: string): key is FeatureFlagKey {
  return vendorFlagsByKey.has(key);
}

/** Install a complete DB snapshot, including deletions. Live flags read the current snapshot. */
export function replaceFeatureFlagDatabaseValues(values: ReadonlyMap<string, boolean>): void {
  databaseValues.clear();
  for (const [key, enabled] of values) databaseValues.set(key, enabled);
}

/** Install the release preset (flavor defaults). Keys may name pack flags registered later. */
export function replaceFeatureFlagPresetValues(
  values: ReadonlyMap<string, boolean>,
  name?: string,
): void {
  presetValues.clear();
  for (const [key, enabled] of values) presetValues.set(key, enabled);
  presetName = name;
}

/** The release flavor whose preset is installed, if any (e.g. `nightly-dogfood`). */
export function currentFeatureFlagPresetName(): string | undefined {
  return presetName;
}

/** Called by the pack host for each pack's `defineFeatureFlags`. A pack key may not shadow a
 * host flag. Registering a pack key again replaces it: the compiled-in distribution and its
 * runtime copy in the packs dir are the same pack. */
export function registerPackFeatureFlags(definitions: ReadonlyArray<PackFeatureFlagDefinition>) {
  for (const { key, ...definition } of definitions) {
    if (isVendorFlagKey(key)) {
      throw new Error(`Feature flag "${key}" is a host flag; a pack cannot register it.`);
    }
    packFlags.set(key, { key, scope: "pack", envName: featureFlagEnvName(key), ...definition });
  }
}

/** Test seam: forget pack registrations between cases. */
export function clearPackFeatureFlags(): void {
  packFlags.clear();
}

export function listFeatureFlags(): ReadonlyArray<RegisteredFeatureFlag> {
  return [...vendorFlags, ...packFlags.values()];
}

export function findFeatureFlag(key: string): RegisteredFeatureFlag | undefined {
  return vendorFlagsByKey.get(key) ?? packFlags.get(key);
}

const EXPLICIT_FLAG_OFF = ["0", "false", "off"];
const EXPLICIT_FLAG_ON = ["1", "true", "on"];

/** Explicit `0`/`false`/`off` and `1`/`true`/`on` (trimmed, case-insensitive) decide; unset,
 * blank and unrecognized values are not an override. */
export function parseFeatureFlagOverride(raw: string | undefined): boolean | undefined {
  const normalized = raw?.trim().toLowerCase();
  if (normalized === undefined) return undefined;
  if (EXPLICIT_FLAG_OFF.includes(normalized)) return false;
  if (EXPLICIT_FLAG_ON.includes(normalized)) return true;
  return undefined;
}

function readEnvOverride(flag: RegisteredFeatureFlag, readEnv: ReadFeatureFlagEnv) {
  for (const name of [flag.envName, ...(flag.envAliases ?? [])]) {
    const value = parseFeatureFlagOverride(readEnv(name));
    if (value !== undefined) return value;
  }
  return undefined;
}

function resolveRegistered(
  flag: RegisteredFeatureFlag,
  readEnv: ReadFeatureFlagEnv,
): ResolvedFeatureFlag {
  const candidates: ReadonlyArray<readonly [FeatureFlagSource, boolean | undefined]> = [
    ["env", readEnvOverride(flag, readEnv)],
    ["user", flag.userToggleable === false ? undefined : databaseValues.get(flag.key)],
    ["preset", presetValues.get(flag.key)],
  ];
  for (const [source, enabled] of candidates) {
    if (enabled !== undefined) return { ...flag, enabled, source };
  }
  return { ...flag, enabled: flag.defaultEnabled, source: "default" };
}

export function resolveFeatureFlag(
  key: string,
  readEnv: ReadFeatureFlagEnv = processEnv,
): ResolvedFeatureFlag | undefined {
  const flag = findFeatureFlag(key);
  return flag === undefined ? undefined : resolveRegistered(flag, readEnv);
}

export function resolveFeatureFlags(
  readEnv: ReadFeatureFlagEnv = processEnv,
): ReadonlyArray<ResolvedFeatureFlag> {
  return listFeatureFlags().map((flag) => resolveRegistered(flag, readEnv));
}

/** Effective value of a host flag: env > user value > release preset > code default. */
export function readFeatureFlag(
  key: FeatureFlagKey,
  readEnv: ReadFeatureFlagEnv = processEnv,
): boolean {
  return resolveFeatureFlag(key, readEnv)?.enabled ?? FEATURE_FLAG_DEFINITIONS[key].defaultEnabled;
}
