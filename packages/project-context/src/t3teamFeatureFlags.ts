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
      "Set up a project machine from the first message of a cloud session for a project that has none. Changes apply immediately.",
  },
  // Temporarily disabled 2026-10-07: the work profiles are too dev-focused (only the developer
  // profile is actually tailored), so the chooser costs a setup step without changing the UX.
  // Relanding is tracked in https://nexplore.ghe.com/hive/nx-nexi/issues/60 — turn it back on
  // per process with `NEXI_FF_WORK_PROFILE_CHOOSER=1`.
  WORK_PROFILE_CHOOSER: {
    defaultEnabled: false,
    requiresRestart: false,
    description:
      "Show the work profile chooser (first-run setup, add-project wizard, Settings). Off: everyone uses the developer profile.",
  },
  MYWORK_RIGHT_PANEL: {
    defaultEnabled: true,
    requiresRestart: false,
    description:
      "My Work aside uses RightPanelTabs (PR/thread/browser tabs) with Agent kickoff when empty. Off: legacy DigestPrAside swap.",
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
