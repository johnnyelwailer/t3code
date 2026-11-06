import { describe, expect, it, vi } from "vite-plus/test";

import type { DesktopVoiceBridge } from "@t3tools/client-runtime/voice-input";
import type { DesktopVoiceConfig } from "@t3tools/contracts";

import {
  createDesktopWhisperDictationEngine,
  getDictationEngine,
} from "./t3team-dictationEngine.ts";

const config: DesktopVoiceConfig = {
  model: "large-v3-turbo",
  modelPath: "",
  language: "de",
  languages: "de,en",
  silenceMs: 1500,
};

function makeBridge(overrides: Partial<DesktopVoiceBridge> = {}): DesktopVoiceBridge {
  return {
    prepareVoiceTranscriber: vi.fn(async () => ({
      ok: true as const,
      modelPath: "E:/models/ggml-largev3.bin",
      modelSource: "download" as const,
    })),
    transcribeVoice: vi.fn(async () => ({
      ok: true as const,
      text: " hallo welt ",
      acceleration: "gpu" as const,
      elapsedMs: 10,
    })),
    ...overrides,
  };
}

const missingModel = () => ({
  ok: false as const,
  code: "model-unavailable" as const,
  message: "model not on disk",
});
const noRuntime = () => ({
  ok: false as const,
  code: "runtime-unavailable" as const,
  message: "no whisper host",
});

const signal = () => new AbortController().signal;

describe("getDictationEngine", () => {
  it("returns null when there is no native bridge", () => {
    expect(getDictationEngine({ getConfig: () => config })).toBeNull();
  });

  it("returns the desktop whisper engine when the bridge is present", () => {
    const engine = getDictationEngine({ bridge: makeBridge(), getConfig: () => config });
    expect(engine?.id).toBe("t3team-whisper-desktop");
    expect(engine?.transcriber).toBeDefined();
  });
});

describe("createDesktopWhisperDictationEngine status", () => {
  it("reports ready with the contract's status fields when the model is present", async () => {
    await expect(
      createDesktopWhisperDictationEngine({
        bridge: makeBridge(),
        getConfig: () => config,
      }).status(),
    ).resolves.toEqual({
      supported: true,
      state: "ready",
      modelId: "large-v3-turbo",
      model: "large-v3-turbo",
      size: 0,
      supportsStreaming: true,
      supportsTranslation: false,
      acceleration: "auto",
      modelUnloadTimeout: "never",
      gpuDevices: [],
    });
  });

  it("reports missing-model when the model is not downloaded yet", async () => {
    const bridge = makeBridge({ prepareVoiceTranscriber: vi.fn(async () => missingModel()) });
    await expect(
      createDesktopWhisperDictationEngine({ bridge, getConfig: () => config }).status(),
    ).resolves.toEqual({
      supported: true,
      state: "missing-model",
      modelId: "large-v3-turbo",
      model: "large-v3-turbo",
      size: 0,
      supportsStreaming: true,
      supportsTranslation: false,
      acceleration: "auto",
      modelUnloadTimeout: "never",
      gpuDevices: [],
    });
  });

  it("reports unsupported when the native runtime is unavailable", async () => {
    const bridge = makeBridge({ prepareVoiceTranscriber: vi.fn(async () => noRuntime()) });
    await expect(
      createDesktopWhisperDictationEngine({ bridge, getConfig: () => config }).status(),
    ).resolves.toEqual({ supported: false, reason: "no whisper host" });
  });
});

describe("createDesktopWhisperDictationEngine models", () => {
  it("reports the settings model as installed when present", async () => {
    const models = await createDesktopWhisperDictationEngine({
      bridge: makeBridge(),
      getConfig: () => config,
    }).models();
    expect(models).toEqual({
      models: [
        {
          id: "large-v3-turbo",
          name: "large-v3-turbo",
          description: "Local whisper model",
          size: 0,
          languages: ["de", "en"],
          accuracy: 0,
          speed: 0,
          recommended: false,
          supportsStreaming: true,
          supportsLanguageDetection: true,
          supportsTranslation: false,
          active: true,
          state: "installed",
        },
      ],
    });
  });

  it("reports the settings model as downloadable when missing", async () => {
    const bridge = makeBridge({ prepareVoiceTranscriber: vi.fn(async () => missingModel()) });
    const models = await createDesktopWhisperDictationEngine({
      bridge,
      getConfig: () => config,
    }).models();
    expect(models.models[0]?.state).toBe("downloadable");
  });
});

describe("createDesktopWhisperDictationEngine transcribe", () => {
  it("maps the native result onto the contract's result shape", async () => {
    const bridge = makeBridge();
    const result = await createDesktopWhisperDictationEngine({
      bridge,
      getConfig: () => config,
    }).transcribe({ pcm16Base64: "UENN" }, { signal: signal() });
    expect(bridge.transcribeVoice).toHaveBeenCalledWith({ config, pcm16Base64: "UENN" });
    expect(result.text).toBe(" hallo welt ");
    expect(result.acceleration).toBe("gpu");
    expect(result.elapsedMs).toBe(10);
  });

  it("throws when the native pass fails", async () => {
    const bridge = makeBridge({
      transcribeVoice: vi.fn(async () => ({
        ok: false as const,
        code: "transcription-failed" as const,
        message: "boom",
      })),
    });
    await expect(
      createDesktopWhisperDictationEngine({ bridge, getConfig: () => config }).transcribe(
        { pcm16Base64: "UENN" },
        { signal: signal() },
      ),
    ).rejects.toThrow("boom");
  });

  it("throws when the request was aborted before it started", async () => {
    const bridge = makeBridge();
    const aborted = new AbortController();
    aborted.abort();
    await expect(
      createDesktopWhisperDictationEngine({ bridge, getConfig: () => config }).transcribe(
        { pcm16Base64: "UENN" },
        { signal: aborted.signal },
      ),
    ).rejects.toThrow("cancelled");
    expect(bridge.transcribeVoice).not.toHaveBeenCalled();
  });
});

describe("the engine's controller-facing transcriber", () => {
  it("decodes the recording and returns the sanitized transcript", async () => {
    const bridge = makeBridge();
    const decodeRecording = vi.fn(async () => "UENN");
    const engine = createDesktopWhisperDictationEngine({
      bridge,
      getConfig: () => config,
      decodeRecording,
    });

    const prepared = await engine.transcriber.prepare({ signal: signal() });
    expect(prepared.locale).toBe("de");
    const text = await prepared.transcribe("blob:recording", { signal: signal() });

    expect(decodeRecording).toHaveBeenCalledWith("blob:recording");
    expect(bridge.transcribeVoice).toHaveBeenCalledWith({ config, pcm16Base64: "UENN" });
    expect(text).toBe("hallo welt");
  });
});
