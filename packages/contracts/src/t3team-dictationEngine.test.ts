import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import {
  DictationEngineAcceleration,
  DictationEngineModel,
  DictationEngineModels,
  DictationEngineState,
  DictationEngineStatus,
  DictationEngineStreamEvent,
  DictationEngineTranscriptionResult,
} from "./t3team-dictationEngine.ts";

const decodeStatus = Schema.decodeUnknownSync(DictationEngineStatus);
const decodeStreamEvent = Schema.decodeUnknownSync(DictationEngineStreamEvent);
const decodeTranscriptionResult = Schema.decodeUnknownSync(DictationEngineTranscriptionResult);
const decodeModel = Schema.decodeUnknownSync(DictationEngineModel);
const decodeModels = Schema.decodeUnknownSync(DictationEngineModels);
const decodeState = Schema.decodeUnknownSync(DictationEngineState);
const decodeAcceleration = Schema.decodeUnknownSync(DictationEngineAcceleration);

const readyStatus = {
  supported: true as const,
  state: "ready" as const,
  modelId: "large-v3-turbo",
  model: "large-v3-turbo",
  size: 0,
  supportsStreaming: true,
  supportsTranslation: false,
  acceleration: "auto" as const,
  modelUnloadTimeout: "never" as const,
  gpuDevices: [] as Array<{ id: string; name: string }>,
};

describe("DictationEngineStatus", () => {
  it("decodes the unsupported form", () => {
    expect(decodeStatus({ supported: false, reason: "no native host" })).toEqual({
      supported: false,
      reason: "no native host",
    });
  });

  it("decodes a supported status with only the fields the engine reports", () => {
    expect(decodeStatus(readyStatus)).toEqual(readyStatus);
  });

  it("carries the optional extras when present", () => {
    const status = decodeStatus({
      ...readyStatus,
      supportsBufferedStreaming: true,
      languages: ["de", "en"],
      supportsLanguageDetection: true,
      gpuDevices: [{ id: "0", name: "RTX 5070" }],
    });
    expect(status.supported).toBe(true);
    if (status.supported) {
      expect(status.languages).toEqual(["de", "en"]);
      expect(status.gpuDevices).toHaveLength(1);
    }
  });

  it("rejects a state that is not one of the three contract states", () => {
    expect(() => decodeStatus({ ...readyStatus, state: "bogus" })).toThrow();
  });
});

describe("DictationEngine recognition vocabulary", () => {
  it("mirrors the three contract states", () => {
    expect(decodeState("missing-model")).toBe("missing-model");
    expect(decodeState("ready")).toBe("ready");
    expect(decodeState("transcribing")).toBe("transcribing");
  });

  it("accepts auto, cpu, and a pinned gpu device", () => {
    expect(decodeAcceleration("auto")).toBe("auto");
    expect(decodeAcceleration("cpu")).toBe("cpu");
    expect(decodeAcceleration("gpu:0")).toBe("gpu:0");
  });
});

describe("DictationEngine stream + transcribe + models", () => {
  it("decodes ready", () => {
    expect(decodeStreamEvent({ type: "ready" })).toEqual({ type: "ready" });
  });

  it("decodes an update whose text is null", () => {
    expect(decodeStreamEvent({ type: "update", revision: 3, text: null })).toEqual({
      type: "update",
      revision: 3,
      text: null,
    });
  });

  it("decodes an update carrying committed and tentative text", () => {
    expect(
      decodeStreamEvent({
        type: "update",
        revision: 1,
        text: { committed: "hi", tentative: " there" },
      }),
    ).toEqual({ type: "update", revision: 1, text: { committed: "hi", tentative: " there" } });
  });

  it("decodes finished and error", () => {
    expect(decodeStreamEvent({ type: "finished", text: "done" })).toEqual({
      type: "finished",
      text: "done",
    });
    expect(decodeStreamEvent({ type: "error", message: "boom" })).toEqual({
      type: "error",
      message: "boom",
    });
  });

  it("decodes a result with only text, mirroring the contract", () => {
    expect(decodeTranscriptionResult({ text: "hello" })).toEqual({ text: "hello" });
  });

  it("decodes a result with the desktop extras", () => {
    expect(
      decodeTranscriptionResult({
        text: "hello",
        language: "en",
        acceleration: "cpu",
        device: "cpu",
        elapsedMs: 42,
      }),
    ).toEqual({ text: "hello", language: "en", acceleration: "cpu", device: "cpu", elapsedMs: 42 });
  });

  it("decodes a catalog entry and an empty catalog", () => {
    expect(
      decodeModel({
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
      }),
    ).toMatchObject({ id: "large-v3-turbo", state: "installed", active: true });
    expect(decodeModels({ models: [] })).toEqual({ models: [] });
  });
});
