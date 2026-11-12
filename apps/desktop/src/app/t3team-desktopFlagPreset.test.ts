// @effect-diagnostics nodeBuiltinImport:off - writes a packaged-resources fixture to a temp dir.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  readFeatureFlag,
  replaceFeatureFlagPresetValues,
} from "@t3tools/project-context/t3teamFeatureFlags";

import { installPackagedFlagPreset } from "./t3team-desktopFlagPreset.ts";

const noEnv = () => undefined;

function resourcesWith(preset: string | undefined): string {
  const dir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3team-flag-preset-"));
  if (preset !== undefined) NodeFS.writeFileSync(NodePath.join(dir, "flag-preset.json"), preset);
  return dir;
}

afterEach(() => replaceFeatureFlagPresetValues(new Map()));

describe("installPackagedFlagPreset", () => {
  it("installs the packaged preset and exports it for the backend", () => {
    const text = JSON.stringify({ flavor: "nightly-user", flags: { BACKEND_WATCHDOG: false } });
    const env: Record<string, string | undefined> = {};
    installPackagedFlagPreset(resourcesWith(text), env);
    expect(env.T3TEAM_FLAG_PRESET).toBe(text);
    expect(readFeatureFlag("BACKEND_WATCHDOG", noEnv)).toBe(false);
  });

  it("prefers an explicit T3TEAM_FLAG_PRESET over the packaged file", () => {
    const packaged = JSON.stringify({ flags: { BACKEND_WATCHDOG: false } });
    const explicit = JSON.stringify({ flags: { BACKEND_WATCHDOG: true } });
    const env: Record<string, string | undefined> = { T3TEAM_FLAG_PRESET: explicit };
    installPackagedFlagPreset(resourcesWith(packaged), env);
    expect(env.T3TEAM_FLAG_PRESET).toBe(explicit);
    expect(readFeatureFlag("BACKEND_WATCHDOG", noEnv)).toBe(true);
  });

  it("drops a malformed preset and leaves the code defaults", () => {
    const env: Record<string, string | undefined> = {};
    installPackagedFlagPreset(resourcesWith('{"flags":{"BACKEND_WATCHDOG":"no"}}'), env);
    expect(env.T3TEAM_FLAG_PRESET).toBeUndefined();
    expect(readFeatureFlag("BACKEND_WATCHDOG", noEnv)).toBe(true);
  });

  it("does nothing for a build without a flavor", () => {
    const env: Record<string, string | undefined> = {};
    installPackagedFlagPreset(resourcesWith(undefined), env);
    expect(env).toEqual({});
  });
});
