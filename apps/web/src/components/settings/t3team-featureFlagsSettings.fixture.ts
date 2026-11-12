/**
 * A `FeatureFlagsView` resolved by the real registry, shaped like `server.getFeatureFlags`
 * answers it: every host flag, three pack flags as the nexplore-global pack registers them,
 * one env override, two user choices (one needing a restart), the `nightly-dogfood` preset
 * turning several default-off flags on, and code defaults for the rest. Stories and browser
 * tests share it.
 */
import type { FeatureFlagsView } from "@t3tools/contracts";
import {
  FEATURE_FLAG_GROUPS,
  clearPackFeatureFlags,
  registerPackFeatureFlags,
  replaceFeatureFlagDatabaseValues,
  replaceFeatureFlagPresetValues,
  resolveFeatureFlags,
  type PackFeatureFlagDefinition,
  type ReadFeatureFlagEnv,
  type ResolvedFeatureFlag,
} from "@t3tools/project-context/t3teamFeatureFlags";

export const FIXTURE_PRESET = "nightly-dogfood";
export const FIXTURE_ENV_FLAG = "RESOURCE_PRESSURE";
export const FIXTURE_USER_FLAGS = ["ORCHESTRATION_SIGNAL_SOURCES", "agent.machine_gate"] as const;

const PACK_FLAGS: ReadonlyArray<PackFeatureFlagDefinition> = [
  {
    key: "agent.conductor_tier",
    group: "Agent",
    subgroup: "Nexplore AI",
    label: "Conductor tier",
    description:
      "The model picker offers Conductor: an orchestrate-only prompt on the Deep model. Off: a saved Conductor choice runs as Standard.",
    defaultEnabled: true,
    requiresRestart: false,
  },
  {
    key: "agent.machine_gate",
    group: "Agent",
    subgroup: "Nexplore AI",
    label: "Machine gate",
    description:
      "Installs, builds and dev-server starts from all threads queue for a bounded number of machine-wide slots. Off: every thread runs them at once.",
    defaultEnabled: true,
    requiresRestart: false,
  },
  {
    key: "agent.auto-classifier",
    group: "Agent",
    subgroup: "Nexplore AI",
    label: "Auto access classifier",
    description:
      "In Auto access mode a model reviews every tool call for risk before it runs. Off: Auto behaves like Ask.",
    defaultEnabled: false,
    requiresRestart: false,
  },
];

const PRESET_VALUES = new Map([
  ["AGENTS_MAILBOX", true],
  ["MYWORK_KANBAN", true],
  ["WORKITEM_PLANNING_SPACE", true],
  ["INTEGRATIONS_ATLASSIAN", true],
  ["CHANGE_REQUEST_WORKSPACE", true],
  ["CLOUD_SESSIONS", true],
  ["agent.auto-classifier", true],
]);

const USER_VALUES = new Map<string, boolean>([
  ["ORCHESTRATION_SIGNAL_SOURCES", true],
  ["agent.machine_gate", false],
]);

const readEnv: ReadFeatureFlagEnv = (name) =>
  name === `NEXI_FF_${FIXTURE_ENV_FLAG}` ? "1" : undefined;

function toView(
  flags: ReadonlyArray<ResolvedFeatureFlag>,
  startup: ReadonlyMap<string, boolean>,
): FeatureFlagsView {
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
    preset: FIXTURE_PRESET,
  };
}

/** Resolves through the registry's own layering, then puts the module state back.
 * `userValues: false` is the view a reset of every user choice would answer with. */
export function buildFeatureFlagsViewFixture({ userValues = true } = {}): FeatureFlagsView {
  try {
    registerPackFeatureFlags(PACK_FLAGS);
    replaceFeatureFlagPresetValues(PRESET_VALUES, FIXTURE_PRESET);
    replaceFeatureFlagDatabaseValues(new Map());
    const startup = new Map(resolveFeatureFlags(readEnv).map((flag) => [flag.key, flag.enabled]));
    replaceFeatureFlagDatabaseValues(userValues ? USER_VALUES : new Map());
    return toView(resolveFeatureFlags(readEnv), startup);
  } finally {
    clearPackFeatureFlags();
    replaceFeatureFlagPresetValues(new Map());
    replaceFeatureFlagDatabaseValues(new Map());
  }
}
