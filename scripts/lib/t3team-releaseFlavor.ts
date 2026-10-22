// @effect-diagnostics nodeBuiltinImport:off - build script reads the preset outside the Effect runtime.
import * as NodeFS from "node:fs";

import * as Data from "effect/Data";

import { parseFeatureFlagPreset } from "@t3tools/project-context/t3team-featureFlagPreset";

/**
 * Release flavors (distribution `--flavor`): a feature-flag preset baked in as the
 * `flag-preset.json` extra resource, and an app id so two flavors install side by side instead of
 * sharing one Windows uninstall entry and one macOS bundle id.
 *
 * `T3CODE_DESKTOP_FLAG_PRESET` names the preset file; `T3CODE_DESKTOP_APP_ID` overrides the app id.
 */
export const DEFAULT_DESKTOP_APP_ID = "com.t3tools.t3code";
export const FLAG_PRESET_RESOURCE = "flag-preset.json";

type Env = Readonly<Record<string, string | undefined>>;

export class T3TeamFlagPresetError extends Data.TaggedError("T3TeamFlagPresetError")<{
  readonly message: string;
}> {}

export function resolveDesktopAppId(env: Env): string {
  const override = env.T3CODE_DESKTOP_APP_ID?.trim();
  if (!override) return DEFAULT_DESKTOP_APP_ID;
  if (!/^[A-Za-z][A-Za-z0-9-]*(\.[A-Za-z0-9-]+)+$/.test(override)) {
    throw new Error(`T3CODE_DESKTOP_APP_ID must be a reverse-DNS id, got "${override}"`);
  }
  return override;
}

/** The preset text to stage, validated, or `undefined` when the build has no flavor. */
export function readFlagPresetForStaging(env: Env): string | undefined {
  const presetPath = env.T3CODE_DESKTOP_FLAG_PRESET?.trim();
  if (!presetPath) return undefined;
  const text = NodeFS.readFileSync(presetPath, "utf8");
  parseFeatureFlagPreset(text);
  return text;
}

export function flagPresetExtraResources(staged: boolean) {
  return staged
    ? [{ from: `apps/desktop/prod-resources/${FLAG_PRESET_RESOURCE}`, to: FLAG_PRESET_RESOURCE }]
    : [];
}
