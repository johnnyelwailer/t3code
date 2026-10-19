import { describe, expect, it } from "vite-plus/test";

import {
  acceptableWhisperModels,
  locateWhisperModel,
  whisperModelFileNames,
  type WhisperModelLocatorEnvironment,
} from "./t3team-whisperModelLocator.ts";

const GB = 1_000_000_000;

function environment(
  files: Record<string, number>,
  overrides: Partial<WhisperModelLocatorEnvironment> = {},
): WhisperModelLocatorEnvironment {
  const normalized = new Map(Object.entries(files).map(([k, v]) => [k.replaceAll("\\", "/"), v]));
  return {
    env: {},
    platform: "win32",
    homeDir: "C:/Users/pj",
    appDataDir: "C:/Users/pj/AppData/Roaming",
    appModelsDir: "C:/app/voice/models",
    fileSize: (filePath) => normalized.get(filePath.replaceAll("\\", "/")) ?? null,
    ...overrides,
  };
}

describe("whisper model detection", () => {
  it("names a model the way whisper.cpp and Whisper.net do", () => {
    expect(whisperModelFileNames("large-v3-turbo")).toEqual([
      "ggml-large-v3-turbo.bin",
      "ggml-largev3turbo.bin",
    ]);
  });

  it("finds the activity tracker model under ACTIVITY_TRACKER_DATA_DIR", () => {
    const found = locateWhisperModel(
      { model: "large-v3-turbo" },
      environment(
        { "E:/ActivityTracker/models/whisper/ggml-largev3.bin": 3 * GB },
        { env: { ACTIVITY_TRACKER_DATA_DIR: "E:/ActivityTracker" } },
      ),
    );

    expect(found?.modelSource).toBe("activity-tracker");
    expect(found?.modelPath.replaceAll("\\", "/")).toBe(
      "E:/ActivityTracker/models/whisper/ggml-largev3.bin",
    );
  });

  it("falls back to the default per-platform app root without the override", () => {
    const found = locateWhisperModel(
      { model: "large-v3" },
      environment({
        "C:/Users/pj/AppData/Roaming/ActivityTracker/models/whisper/ggml-largev3.bin": GB,
      }),
    );
    expect(found?.modelSource).toBe("activity-tracker");
  });

  it("prefers the turbo file over plain large-v3 and our own downloads over the tracker", () => {
    const files = {
      "E:/ActivityTracker/models/whisper/ggml-largev3turbo.bin": GB,
      "E:/ActivityTracker/models/whisper/ggml-largev3.bin": 3 * GB,
    };
    const env = { ACTIVITY_TRACKER_DATA_DIR: "E:/ActivityTracker" };
    expect(
      locateWhisperModel({ model: "large-v3-turbo" }, environment(files, { env }))?.modelPath,
    ).toContain("largev3turbo");

    const withDownload = environment(
      { ...files, "C:/app/voice/models/ggml-large-v3-turbo.bin": GB },
      { env },
    );
    expect(locateWhisperModel({ model: "large-v3-turbo" }, withDownload)?.modelSource).toBe(
      "app-models",
    );
  });

  it("ignores truncated files and never substitutes a large model for a smaller configured one", () => {
    const env = { ACTIVITY_TRACKER_DATA_DIR: "E:/ActivityTracker" };
    expect(
      locateWhisperModel(
        { model: "large-v3" },
        environment({ "E:/ActivityTracker/models/whisper/ggml-largev3.bin": 10 }, { env }),
      ),
    ).toBeNull();
    expect(
      locateWhisperModel(
        { model: "medium" },
        environment({ "E:/ActivityTracker/models/whisper/ggml-largev3.bin": 3 * GB }, { env }),
      ),
    ).toBeNull();
    expect(acceptableWhisperModels("medium")).toEqual(["medium"]);
  });
});
