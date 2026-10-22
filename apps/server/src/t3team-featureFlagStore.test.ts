import { assert, it } from "@effect/vitest";
import { afterEach, describe, expect, test } from "vite-plus/test";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import {
  listFeatureFlags,
  readFeatureFlag,
  replaceFeatureFlagDatabaseValues,
  replaceFeatureFlagPresetValues,
} from "@t3tools/project-context/t3teamFeatureFlags";
import { isMainRepositoryEnabled } from "./t3team-mainRepositoryFlag.ts";
import { isMachineSetupEnabled } from "./cloud/t3team-machineSetupFlag.ts";
import { isWorkProfileChooserEnabled } from "./t3team-workProfileChooserFlag.ts";
import {
  PROJECT_STATE_DIR,
  resolveProjectStateDirName,
} from "@t3tools/project-context/t3teamProjectStateDir";
import { initializeFeatureFlags, setFeatureFlag } from "./t3team-featureFlagStore.ts";

const noEnv = () => undefined;
afterEach(() => replaceFeatureFlagDatabaseValues(new Map()));

describe("feature flag layering", () => {
  test("env > DB > default, with live MAIN_REPOSITORY reads", () => {
    expect(readFeatureFlag("MAIN_REPOSITORY", noEnv)).toBe(true);
    expect(readFeatureFlag("MAIN_REPOSITORY", () => "")).toBe(true);
    expect(readFeatureFlag("MAIN_REPOSITORY", () => "  ")).toBe(true);
    replaceFeatureFlagDatabaseValues(new Map([["MAIN_REPOSITORY", false]]));
    expect(isMainRepositoryEnabled(noEnv)).toBe(false);
    expect(isMainRepositoryEnabled(() => "")).toBe(false);
    expect(isMainRepositoryEnabled(() => "yes")).toBe(false);
    expect(isMainRepositoryEnabled(() => "on")).toBe(true);
    replaceFeatureFlagDatabaseValues(new Map([["MAIN_REPOSITORY", true]]));
    expect(isMainRepositoryEnabled(() => "0")).toBe(false);
    expect(isMainRepositoryEnabled(() => "false")).toBe(false);
    expect(isMainRepositoryEnabled(() => "OFF")).toBe(false);
    expect(isMainRepositoryEnabled(noEnv)).toBe(true);
    replaceFeatureFlagDatabaseValues(new Map());
    expect(isMainRepositoryEnabled(noEnv)).toBe(true);
    expect(isMainRepositoryEnabled(() => "yes")).toBe(true);
  });

  test("MACHINE_SETUP is on by default, off from the DB, and the env wins either way", () => {
    expect(isMachineSetupEnabled(noEnv)).toBe(true);
    replaceFeatureFlagDatabaseValues(new Map([["MACHINE_SETUP", false]]));
    expect(isMachineSetupEnabled(noEnv)).toBe(false);
    expect(isMachineSetupEnabled(() => "1")).toBe(true);
    expect(isMachineSetupEnabled(() => "0")).toBe(false);
    replaceFeatureFlagDatabaseValues(new Map());
    expect(isMachineSetupEnabled(() => "1")).toBe(true);
  });

  test("WORK_PROFILE_CHOOSER defaults off, env and DB can turn it on live", () => {
    expect(isWorkProfileChooserEnabled(noEnv)).toBe(false);
    expect(isWorkProfileChooserEnabled(() => "")).toBe(false);
    expect(isWorkProfileChooserEnabled(() => "yes")).toBe(false);
    expect(isWorkProfileChooserEnabled(() => "1")).toBe(true);
    expect(isWorkProfileChooserEnabled(() => "TRUE")).toBe(true);
    replaceFeatureFlagDatabaseValues(new Map([["WORK_PROFILE_CHOOSER", true]]));
    expect(isWorkProfileChooserEnabled(noEnv)).toBe(true);
    expect(isWorkProfileChooserEnabled(() => "off")).toBe(false);
  });

  test("state dir follows env and the release preset, never a user value", () => {
    const startup = PROJECT_STATE_DIR;
    replaceFeatureFlagDatabaseValues(new Map());
    expect(resolveProjectStateDirName(noEnv)).toBe(".nexi");
    expect(resolveProjectStateDirName(() => "")).toBe(".nexi");
    expect(resolveProjectStateDirName(() => "off")).toBe(".t3team");
    replaceFeatureFlagDatabaseValues(new Map([["NEXI_STATE_DIR", false]]));
    expect(resolveProjectStateDirName(noEnv)).toBe(".nexi");
    replaceFeatureFlagPresetValues(new Map([["NEXI_STATE_DIR", false]]));
    expect(resolveProjectStateDirName(noEnv)).toBe(".t3team");
    expect(resolveProjectStateDirName(() => "1")).toBe(".nexi");
    replaceFeatureFlagPresetValues(new Map());
    expect(PROJECT_STATE_DIR).toBe(startup);
    expect(listFeatureFlags().slice(0, 6)).toEqual([
      expect.objectContaining({ key: "MAIN_REPOSITORY", requiresRestart: false }),
      expect.objectContaining({
        key: "NEXI_STATE_DIR",
        requiresRestart: true,
        userToggleable: false,
      }),
      expect.objectContaining({ key: "MACHINE_SETUP", requiresRestart: false }),
      expect.objectContaining({
        key: "WORK_PROFILE_CHOOSER",
        requiresRestart: false,
        defaultEnabled: false,
      }),
      expect.objectContaining({
        key: "MYWORK_RIGHT_PANEL",
        requiresRestart: false,
        defaultEnabled: true,
      }),
      expect.objectContaining({
        key: "TRANSIENT_AUTO_RESUME",
        requiresRestart: false,
        defaultEnabled: true,
      }),
    ]);
  });
});

it.layer(NodeSqliteClient.layer({ filename: ":memory:" }))("feature_flags SQL seam", (it) => {
  it.effect("creates schema idempotently, loads persisted values and publishes Admin writes", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* initializeFeatureFlags();
      yield* initializeFeatureFlags();
      assert.equal(readFeatureFlag("MAIN_REPOSITORY", noEnv), true);
      yield* setFeatureFlag("MAIN_REPOSITORY", true);
      assert.equal(readFeatureFlag("MAIN_REPOSITORY", noEnv), true);
      yield* setFeatureFlag("MAIN_REPOSITORY", false);
      assert.equal(readFeatureFlag("MAIN_REPOSITORY", noEnv), false);
      yield* setFeatureFlag("MACHINE_SETUP", false);
      replaceFeatureFlagDatabaseValues(new Map());
      yield* initializeFeatureFlags();
      assert.equal(readFeatureFlag("MACHINE_SETUP", noEnv), false);
      const rows = yield* sql<{ readonly key: string }>`SELECT key FROM feature_flags`;
      assert.equal(rows.length, 2);
      yield* setFeatureFlag("MACHINE_SETUP", null);
      assert.equal(readFeatureFlag("MACHINE_SETUP", noEnv), true);
      const locked = yield* Effect.flip(setFeatureFlag("NEXI_STATE_DIR", false));
      assert.equal(locked.category, "locked");
      const unknown = yield* Effect.flip(setFeatureFlag("NOT_A_FLAG", true));
      assert.equal(unknown.category, "unknown");
    }),
  );
});
