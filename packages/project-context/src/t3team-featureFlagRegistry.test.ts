import { afterEach, describe, expect, test } from "vite-plus/test";

import {
  FEATURE_FLAG_GROUPS,
  clearPackFeatureFlags,
  currentFeatureFlagPresetName,
  featureFlagEnvName,
  listFeatureFlags,
  readFeatureFlag,
  registerPackFeatureFlags,
  replaceFeatureFlagDatabaseValues,
  replaceFeatureFlagPresetValues,
  resolveFeatureFlag,
} from "./t3teamFeatureFlags.ts";
import {
  FEATURE_FLAG_PRESET_ENV,
  installFeatureFlagPresetFromEnv,
  parseFeatureFlagPreset,
} from "./t3team-featureFlagPreset.ts";

const noEnv = () => undefined;
const envOf = (values: Record<string, string>) => (key: string) => values[key];

afterEach(() => {
  replaceFeatureFlagDatabaseValues(new Map());
  replaceFeatureFlagPresetValues(new Map());
  clearPackFeatureFlags();
});

const packFlag = {
  key: "agent.machine_gate",
  group: "Agent",
  label: "Machine gate",
  description: "Heavy commands take a machine-wide slot.",
  defaultEnabled: false,
  requiresRestart: false,
  envAliases: ["NEXI_FF_MACHINE_GATE"],
} as const;

describe("layering: env > user > preset > default", () => {
  test("each layer wins over the ones below it and reports itself as the source", () => {
    expect(resolveFeatureFlag("MYWORK_KANBAN", noEnv)).toMatchObject({
      enabled: false,
      source: "default",
    });
    replaceFeatureFlagPresetValues(new Map([["MYWORK_KANBAN", true]]), "nightly-dogfood");
    expect(resolveFeatureFlag("MYWORK_KANBAN", noEnv)).toMatchObject({
      enabled: true,
      source: "preset",
    });
    replaceFeatureFlagDatabaseValues(new Map([["MYWORK_KANBAN", false]]));
    expect(resolveFeatureFlag("MYWORK_KANBAN", noEnv)).toMatchObject({
      enabled: false,
      source: "user",
    });
    const on = envOf({ NEXI_FF_MYWORK_KANBAN: " ON " });
    expect(resolveFeatureFlag("MYWORK_KANBAN", on)).toMatchObject({ enabled: true, source: "env" });
    expect(readFeatureFlag("MYWORK_KANBAN", envOf({ NEXI_FF_MYWORK_KANBAN: "maybe" }))).toBe(false);
    expect(currentFeatureFlagPresetName()).toBe("nightly-dogfood");
  });

  test("a flag the release owns ignores user values but follows env and preset", () => {
    replaceFeatureFlagDatabaseValues(new Map([["NEXI_STATE_DIR", false]]));
    expect(resolveFeatureFlag("NEXI_STATE_DIR", noEnv)).toMatchObject({ source: "default" });
    replaceFeatureFlagPresetValues(new Map([["NEXI_STATE_DIR", false]]));
    expect(readFeatureFlag("NEXI_STATE_DIR", noEnv)).toBe(false);
  });

  test("older env names still override, after the NEXI_FF_ name", () => {
    expect(readFeatureFlag("BACKEND_WATCHDOG", envOf({ T3TEAM_BACKEND_WATCHDOG: "0" }))).toBe(
      false,
    );
    const both = envOf({ NEXI_FF_BACKEND_WATCHDOG: "1", T3TEAM_BACKEND_WATCHDOG: "0" });
    expect(readFeatureFlag("BACKEND_WATCHDOG", both)).toBe(true);
  });
});

describe("registry metadata", () => {
  test("every host flag carries a known group, label, description and a unique env name", () => {
    const flags = listFeatureFlags();
    for (const flag of flags) {
      expect(FEATURE_FLAG_GROUPS).toContain(flag.group);
      expect(flag.label.trim()).not.toBe("");
      expect(flag.description.trim()).not.toBe("");
      expect(flag.scope).toBe("vendor");
      expect(flag.envName).toBe(featureFlagEnvName(flag.key));
    }
    expect(new Set(flags.map((flag) => flag.envName)).size).toBe(flags.length);
    expect(flags.find((flag) => flag.key === "SETTINGS_FEATURES_PAGE")?.defaultEnabled).toBe(true);
  });

  test("packs add their own flags; a pack cannot shadow a host flag", () => {
    registerPackFeatureFlags([packFlag]);
    expect(resolveFeatureFlag("agent.machine_gate", noEnv)).toMatchObject({
      scope: "pack",
      envName: "NEXI_FF_AGENT_MACHINE_GATE",
      enabled: false,
    });
    expect(
      resolveFeatureFlag("agent.machine_gate", envOf({ NEXI_FF_MACHINE_GATE: "on" }))?.enabled,
    ).toBe(true);
    registerPackFeatureFlags([{ ...packFlag, defaultEnabled: true }]);
    expect(listFeatureFlags().filter((flag) => flag.key === "agent.machine_gate")).toHaveLength(1);
    expect(() => registerPackFeatureFlags([{ ...packFlag, key: "MAIN_REPOSITORY" }])).toThrow(
      /host flag/,
    );
  });
});

describe("release preset", () => {
  test("parses flavor and boolean flags, and rejects anything else", () => {
    const preset = parseFeatureFlagPreset(
      JSON.stringify({ flavor: "nightly-user", flags: { MYWORK_KANBAN: false } }),
    );
    expect(preset.flavor).toBe("nightly-user");
    expect([...preset.flags]).toEqual([["MYWORK_KANBAN", false]]);
    expect(() => parseFeatureFlagPreset('{"flags":{"X":"on"}}')).toThrow(/boolean/);
    expect(() => parseFeatureFlagPreset("[]")).toThrow(/flags/);
  });

  test("installs from T3TEAM_FLAG_PRESET and leaves the preset empty when unset", () => {
    expect(installFeatureFlagPresetFromEnv(noEnv)).toBeUndefined();
    const text = JSON.stringify({ flavor: "nightly-dogfood", flags: { MYWORK_KANBAN: true } });
    installFeatureFlagPresetFromEnv(envOf({ [FEATURE_FLAG_PRESET_ENV]: text }));
    expect(resolveFeatureFlag("MYWORK_KANBAN", noEnv)?.source).toBe("preset");
  });
});
