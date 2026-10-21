import { describe, expect, it, vi } from "vite-plus/test";

import {
  createDesktopVoiceTranscriber,
  type DesktopVoiceBridge,
} from "./t3team-desktopTranscriber.ts";

const config = { model: "large-v3-turbo", modelPath: "", language: "de", silenceMs: 1500 };

function makeBridge(overrides: Partial<DesktopVoiceBridge> = {}): DesktopVoiceBridge {
  return {
    prepareVoiceTranscriber: vi.fn(async () => ({
      ok: true as const,
      modelPath: "E:/models/ggml-largev3.bin",
      modelSource: "activity-tracker" as const,
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

const signal = () => new AbortController().signal;

describe("createDesktopVoiceTranscriber", () => {
  it("prepares with the configured settings and transcribes the decoded recording", async () => {
    const bridge = makeBridge();
    const decodeRecording = vi.fn(async () => "UENN");
    const transcriber = createDesktopVoiceTranscriber({
      bridge,
      getConfig: () => config,
      decodeRecording,
    });

    const prepared = await transcriber.prepare({ signal: signal() });
    const text = await prepared.transcribe("blob:recording", { signal: signal() });

    expect(bridge.prepareVoiceTranscriber).toHaveBeenCalledWith({ config, allowDownload: true });
    expect(decodeRecording).toHaveBeenCalledWith("blob:recording");
    expect(bridge.transcribeVoice).toHaveBeenCalledWith({ config, pcm16Base64: "UENN" });
    expect(prepared.locale).toBe("de");
    expect(text).toBe("hallo welt");
  });

  it("reads the settings again at transcription time, so a language locked while recording applies", async () => {
    const bridge = makeBridge();
    let language = "auto";
    const prepared = await createDesktopVoiceTranscriber({
      bridge,
      getConfig: () => ({ ...config, language }),
      decodeRecording: async () => "UENN",
    }).prepare({ signal: signal() });

    language = "en";
    await prepared.transcribe("blob:recording", { signal: signal() });

    expect(bridge.transcribeVoice).toHaveBeenCalledWith({
      config: { ...config, language: "en" },
      pcm16Base64: "UENN",
    });
  });

  it("returns an empty transcript for a silence hallucination", async () => {
    const bridge = makeBridge({
      transcribeVoice: async () => ({
        ok: true,
        text: "Thank you for watching!",
        acceleration: "cpu",
        elapsedMs: 5,
      }),
    });
    const prepared = await createDesktopVoiceTranscriber({
      bridge,
      getConfig: () => config,
      decodeRecording: async () => "",
    }).prepare({ signal: signal() });

    expect(await prepared.transcribe("blob:x", { signal: signal() })).toBe("");
  });

  it("surfaces a missing model with the host's own message", async () => {
    const bridge = makeBridge({
      prepareVoiceTranscriber: async () => ({
        ok: false,
        code: "model-unavailable",
        message: "No whisper model was found.",
      }),
    });
    const transcriber = createDesktopVoiceTranscriber({
      bridge,
      getConfig: () => config,
      decodeRecording: async () => "",
    });

    await expect(transcriber.prepare({ signal: signal() })).rejects.toMatchObject({
      code: "model-unavailable",
      message: "No whisper model was found.",
    });
  });

  it("reports an absent runtime as unavailable and a failed run as transcription-failed", async () => {
    const runtimeMissing = createDesktopVoiceTranscriber({
      bridge: makeBridge({
        prepareVoiceTranscriber: async () => ({
          ok: false,
          code: "runtime-unavailable",
          message: "missing",
        }),
      }),
      getConfig: () => config,
      decodeRecording: async () => "",
    });
    await expect(runtimeMissing.prepare({ signal: signal() })).rejects.toMatchObject({
      code: "unavailable",
    });

    const failing = await createDesktopVoiceTranscriber({
      bridge: makeBridge({
        transcribeVoice: async () => ({ ok: false, code: "transcription-failed", message: "boom" }),
      }),
      getConfig: () => config,
      decodeRecording: async () => "",
    }).prepare({ signal: signal() });
    await expect(failing.transcribe("blob:x", { signal: signal() })).rejects.toMatchObject({
      code: "transcription-failed",
    });
  });

  it("stops before touching the host once cancelled", async () => {
    const bridge = makeBridge();
    const controller = new AbortController();
    controller.abort();
    const transcriber = createDesktopVoiceTranscriber({
      bridge,
      getConfig: () => config,
      decodeRecording: async () => "",
    });

    await expect(transcriber.prepare({ signal: controller.signal })).rejects.toMatchObject({
      code: "cancelled",
    });
    expect(bridge.prepareVoiceTranscriber).not.toHaveBeenCalled();
  });
});
