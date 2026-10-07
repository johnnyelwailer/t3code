/** Runtime flags shared by the server and its startup adapter. DB snapshots are populated by
 * the feature_flags store; an Admin write replaces them only after its transaction succeeds. */
export const FEATURE_FLAG_DEFINITIONS = {
  MAIN_REPOSITORY: {
    defaultEnabled: true,
    requiresRestart: false,
    description: "Select and switch a project's main repository. Changes apply immediately.",
  },
  NEXI_STATE_DIR: {
    defaultEnabled: true,
    requiresRestart: true,
    description: "Store project state in .nexi. Changes apply on the next server start.",
  },
  MACHINE_SETUP: {
    defaultEnabled: false,
    requiresRestart: false,
    description:
      "Offer to set up a project machine when a project has none. Changes apply immediately.",
  },
} as const;

export type FeatureFlagKey = keyof typeof FEATURE_FLAG_DEFINITIONS;
export type ReadFeatureFlagEnv = (key: string) => string | undefined;
const databaseValues = new Map<FeatureFlagKey, boolean>();
const processEnv: ReadFeatureFlagEnv = (key) =>
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[key];

/** Install a complete DB snapshot, including deletions. Startup adapters must call this
 * before loading modules that freeze startup-only flags. Live flags read the current snapshot. */
export function replaceFeatureFlagDatabaseValues(
  values: ReadonlyMap<FeatureFlagKey, boolean>,
): void {
  databaseValues.clear();
  for (const [key, enabled] of values) databaseValues.set(key, enabled);
}

const EXPLICIT_FLAG_OFF = ["0", "false", "off"];
const EXPLICIT_FLAG_ON = ["1", "true", "on"];

/** NEXI_FF_<KEY> > feature_flags row > registered code default (on).
 * Explicit `0`/`false`/`off` disables and `1`/`true`/`on` enables (trimmed, case-insensitive).
 * Unset, blank, and unrecognized values are not an override. */
export function readFeatureFlag(
  key: FeatureFlagKey,
  readEnv: ReadFeatureFlagEnv = processEnv,
): boolean {
  const raw = readEnv(`NEXI_FF_${key}`);
  if (raw !== undefined) {
    const normalized = raw.trim().toLowerCase();
    if (EXPLICIT_FLAG_OFF.includes(normalized)) return false;
    if (EXPLICIT_FLAG_ON.includes(normalized)) return true;
  }
  return databaseValues.get(key) ?? FEATURE_FLAG_DEFINITIONS[key].defaultEnabled;
}
