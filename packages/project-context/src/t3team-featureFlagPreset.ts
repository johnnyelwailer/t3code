/** Release presets: a build ships `flag-preset.json` (`{ "flavor", "flags": { key: boolean } }`)
 * and the desktop shell hands its text to the backend in `T3TEAM_FLAG_PRESET`. The preset sits
 * below user values and env, so it sets a flavor's defaults without pinning anything. */
import { replaceFeatureFlagPresetValues, type ReadFeatureFlagEnv } from "./t3teamFeatureFlags.ts";

export const FEATURE_FLAG_PRESET_ENV = "T3TEAM_FLAG_PRESET";

export interface FeatureFlagPreset {
  readonly flavor?: string;
  readonly flags: ReadonlyMap<string, boolean>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Throws on anything but `{ flavor?: string, flags: Record<string, boolean> }`: a malformed
 * preset is a build defect and must not silently fall back to code defaults. */
export function parseFeatureFlagPreset(text: string): FeatureFlagPreset {
  const parsed: unknown = JSON.parse(text);
  if (!isRecord(parsed) || !isRecord(parsed.flags)) {
    throw new Error('Feature flag preset must be an object with a "flags" object.');
  }
  const flags = new Map<string, boolean>();
  for (const [key, value] of Object.entries(parsed.flags)) {
    if (typeof value !== "boolean") {
      throw new Error(`Feature flag preset value for "${key}" must be a boolean.`);
    }
    flags.set(key, value);
  }
  const flavor = typeof parsed.flavor === "string" ? parsed.flavor : undefined;
  return flavor === undefined ? { flags } : { flavor, flags };
}

const processEnv: ReadFeatureFlagEnv = (key) =>
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[key];

/** Install the preset named by `T3TEAM_FLAG_PRESET`. Returns it, or `undefined` when unset. */
export function installFeatureFlagPresetFromEnv(
  readEnv: ReadFeatureFlagEnv = processEnv,
): FeatureFlagPreset | undefined {
  const text = readEnv(FEATURE_FLAG_PRESET_ENV)?.trim();
  if (text === undefined || text === "") return undefined;
  const preset = parseFeatureFlagPreset(text);
  replaceFeatureFlagPresetValues(preset.flags, preset.flavor);
  return preset;
}
