// @effect-diagnostics nodeBuiltinImport:off -- Plain-Node helper owned by the whisper host.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import type { DesktopVoiceConfig, DesktopVoiceModelSource } from "@t3tools/contracts";

/** The activity tracker deletes anything smaller as a corrupt/truncated download. */
const MIN_MODEL_BYTES = 1_000_000;
const ACTIVITY_TRACKER_FOLDER = "ActivityTracker";
const ACTIVITY_TRACKER_DATA_DIR_ENV = "ACTIVITY_TRACKER_DATA_DIR";
const LARGE_V3_FAMILY = ["large-v3-turbo", "large-v3"] as const;

export type WhisperModelLocation = {
  readonly modelPath: string;
  readonly modelSource: DesktopVoiceModelSource;
};

export type WhisperModelLocatorEnvironment = {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly platform: NodeJS.Platform;
  readonly homeDir: string;
  readonly appDataDir: string;
  /** Where this app downloads models; searched first so a download is found next time. */
  readonly appModelsDir: string;
  readonly fileSize?: (filePath: string) => number | null;
};

export function isValidWhisperModelId(model: string): boolean {
  return /^[a-z0-9][a-z0-9._-]*$/i.test(model);
}

/** `large-v3-turbo` is `ggml-large-v3-turbo.bin` upstream and `ggml-largev3turbo.bin` in Whisper.net. */
export function whisperModelFileNames(model: string): readonly string[] {
  return [`ggml-${model}.bin`, `ggml-${model.replaceAll("-", "")}.bin`];
}

/**
 * A configured `large-v3` also accepts the faster `large-v3-turbo`; anything else must match
 * exactly. Never the other way round: `large-v3-turbo` asked for live dictation must not quietly
 * become the 3 GB `large-v3` (30 s to load, seconds a pass).
 */
export function acceptableWhisperModels(model: string): readonly string[] {
  return model === "large-v3" ? [...LARGE_V3_FAMILY] : [model];
}

function activityTrackerRoot(environment: WhisperModelLocatorEnvironment): string {
  const override = environment.env[ACTIVITY_TRACKER_DATA_DIR_ENV]?.trim();
  if (override) return override;
  if (environment.platform === "win32") {
    return NodePath.join(environment.appDataDir, ACTIVITY_TRACKER_FOLDER);
  }
  if (environment.platform === "darwin") {
    return NodePath.join(
      environment.homeDir,
      "Library",
      "Application Support",
      ACTIVITY_TRACKER_FOLDER,
    );
  }
  const xdg = environment.env.XDG_DATA_HOME?.trim();
  return NodePath.join(
    xdg || NodePath.join(environment.homeDir, ".local", "share"),
    ACTIVITY_TRACKER_FOLDER,
  );
}

function whisperModelSearchDirs(environment: WhisperModelLocatorEnvironment) {
  return [
    { dir: environment.appModelsDir, source: "app-models" },
    {
      dir: NodePath.join(activityTrackerRoot(environment), "models", "whisper"),
      source: "activity-tracker",
    },
  ] as const satisfies ReadonlyArray<{ dir: string; source: DesktopVoiceModelSource }>;
}

const statSize = (filePath: string): number | null => {
  try {
    return NodeFS.statSync(filePath).size;
  } catch {
    return null;
  }
};

/**
 * `exact` skips the large-v3 family fallback: automatic dictation asks for `large-v3-turbo` only,
 * never the 3 GB `large-v3` (30 s to load, 0.5-3 s a pass) the activity tracker keeps for meetings.
 */
export function locateWhisperModel(
  config: Pick<DesktopVoiceConfig, "model">,
  environment: WhisperModelLocatorEnvironment,
  options: { readonly exact?: boolean } = {},
): WhisperModelLocation | null {
  const fileSize = environment.fileSize ?? statSize;
  const models = options.exact === true ? [config.model] : acceptableWhisperModels(config.model);
  for (const model of models) {
    for (const { dir, source } of whisperModelSearchDirs(environment)) {
      for (const fileName of whisperModelFileNames(model)) {
        const modelPath = NodePath.join(dir, fileName);
        if ((fileSize(modelPath) ?? 0) >= MIN_MODEL_BYTES) {
          return { modelPath, modelSource: source };
        }
      }
    }
  }
  return null;
}
