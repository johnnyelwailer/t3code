// @effect-diagnostics nodeBuiltinImport:off - read once at startup, like desktop-branding.json.
/**
 * A packaged build ships its release flavor's `flag-preset.json` as an extra resource. The shell
 * installs it for the flags it reads itself (the backend watchdog) and exports its text as
 * `T3TEAM_FLAG_PRESET`, which the backend inherits and installs before its own startup flags
 * freeze. An explicit `T3TEAM_FLAG_PRESET` in the environment wins over the packaged file.
 */
import * as NodeFS from "node:fs";

import {
  FEATURE_FLAG_PRESET_ENV,
  installFeatureFlagPresetFromEnv,
} from "@t3tools/project-context/t3team-featureFlagPreset";

function readPackagedPreset(resourcesPath: string): string | undefined {
  for (const candidate of [
    `${resourcesPath}/flag-preset.json`,
    `${resourcesPath}/resources/flag-preset.json`,
  ]) {
    if (NodeFS.existsSync(candidate)) return NodeFS.readFileSync(candidate, "utf8");
  }
  return undefined;
}

export function installPackagedFlagPreset(
  resourcesPath: string,
  env: Record<string, string | undefined> = process.env,
): void {
  try {
    if (!env[FEATURE_FLAG_PRESET_ENV]?.trim()) {
      const text = readPackagedPreset(resourcesPath);
      if (text === undefined) return;
      env[FEATURE_FLAG_PRESET_ENV] = text;
    }
    installFeatureFlagPresetFromEnv((key) => env[key]);
  } catch (error) {
    // A malformed preset is a build defect; the app still starts on code defaults.
    delete env[FEATURE_FLAG_PRESET_ENV];
    process.stderr.write(`Ignoring malformed flag preset: ${String(error)}\n`);
  }
}
