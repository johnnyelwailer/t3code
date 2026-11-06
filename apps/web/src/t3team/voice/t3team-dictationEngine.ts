import { createDesktopVoiceTranscriber } from "@t3tools/client-runtime/voice-input";
import type { DesktopVoiceBridge } from "@t3tools/client-runtime/voice-input";
import type {
  DesktopVoiceConfig,
  DictationEngineModel,
  DictationEngineModels,
  DictationEngineState,
  DictationEngineStatus,
  DictationEngineTranscriber,
  DictationEngineTranscriptionOptions,
  DictationEngineTranscriptionResult,
} from "@t3tools/contracts";

import { decodeRecordingToPcm16Base64 } from "~/voice/t3team-recordingToPcm";
import type { VoicePcmTap } from "~/voice/t3team-voicePcmTap";

/**
 * The swappable dictation engine: the thing that turns microphone audio into text. `transcriber` is
 * the controller-facing recognition surface (the voice-input `VoiceTranscriber`); `status` /
 * `models` / `transcribe` speak the dictation contract's vocabulary so a desktop engine and the
 * environment speech service read as the same engine.
 */
export type DictationEngine = {
  readonly id: string;
  readonly status: () => Promise<DictationEngineStatus>;
  readonly models: () => Promise<DictationEngineModels>;
  readonly transcriber: DictationEngineTranscriber;
  readonly transcribe: (
    request: { readonly pcm16Base64: string },
    options: DictationEngineTranscriptionOptions,
  ) => Promise<DictationEngineTranscriptionResult>;
};

export type DictationEngineInput = {
  readonly bridge: DesktopVoiceBridge;
  readonly getConfig: () => DesktopVoiceConfig;
  /** The live-tap that ends a running stream session; null when there is no live session. */
  readonly tap?: VoicePcmTap | undefined;
  /**
   * Turns a finished recording into 16 kHz PCM; injectable for tests, defaulting to decoding the
   * renderer's object-URL recording.
   */
  readonly decodeRecording?: ((uri: string) => Promise<string>) | undefined;
};

const DESKTOP_WHISPER_ENGINE_ID = "t3team-whisper-desktop";

/** A desktop engine has no catalog, translation, or offload policy to report; it reads settings. */
function localEngineStatus(
  config: DesktopVoiceConfig,
  probe: { readonly ok: boolean; readonly code?: string; readonly message?: string },
): DictationEngineStatus {
  if (!probe.ok && probe.code === "runtime-unavailable") {
    return { supported: false, reason: probe.message ?? "Voice transcription is unavailable." };
  }
  const state: DictationEngineState = probe.ok ? "ready" : "missing-model";
  const model = config.model || "auto";
  return {
    supported: true,
    state,
    modelId: model,
    model,
    size: 0,
    supportsStreaming: true,
    supportsTranslation: false,
    acceleration: "auto",
    modelUnloadTimeout: "never",
    gpuDevices: [],
  };
}

function localEngineModel(config: DesktopVoiceConfig, installed: boolean): DictationEngineModel {
  const id = config.model || "auto";
  const languages = config.languages
    .split(",")
    .map((code) => code.trim())
    .filter((code) => code.length > 0);
  return {
    id,
    name: id,
    description: "Local whisper model",
    size: 0,
    languages,
    accuracy: 0,
    speed: 0,
    recommended: false,
    supportsStreaming: true,
    supportsLanguageDetection: true,
    supportsTranslation: false,
    active: true,
    state: installed ? "installed" : "downloadable",
  };
}

/**
 * Our one engine today: the desktop whisper host, exposed behind the dictation-engine interface.
 * `transcriber` is the same native-host transcriber the controller has always consumed, so the
 * runtime path is unchanged; `status` / `models` / `transcribe` add the contract's vocabulary over
 * the same bridge. The environment speech service plugs in here as a second engine later.
 */
export function createDesktopWhisperDictationEngine(input: DictationEngineInput): DictationEngine {
  const transcriber: DictationEngineTranscriber = createDesktopVoiceTranscriber({
    bridge: input.bridge,
    getConfig: input.getConfig,
    decodeRecording: input.decodeRecording ?? decodeRecordingToPcm16Base64,
    finishLiveSession: () => input.tap?.finish() ?? Promise.resolve(null),
  });

  const probe = () =>
    input.bridge.prepareVoiceTranscriber({ config: input.getConfig(), allowDownload: false });

  return {
    id: DESKTOP_WHISPER_ENGINE_ID,
    transcriber,
    status: async () => localEngineStatus(input.getConfig(), await probe()),
    models: async () => ({
      models: [localEngineModel(input.getConfig(), (await probe()).ok)],
    }),
    transcribe: async (request, options) => {
      if (options.signal.aborted) throw new Error("cancelled");
      const result = await input.bridge.transcribeVoice({
        config: input.getConfig(),
        pcm16Base64: request.pcm16Base64,
      });
      if (options.signal.aborted) throw new Error("cancelled");
      if (!result.ok) throw new Error(result.message);
      return {
        text: result.text,
        acceleration: result.acceleration,
        elapsedMs: result.elapsedMs,
        ...(result.language !== undefined ? { language: result.language } : {}),
        ...(result.device !== undefined ? { device: result.device } : {}),
      };
    },
  };
}

/**
 * The single engine switch. Today there is exactly one candidate, the desktop whisper host, so a
 * missing native bridge means there is no dictation engine. This is where a second engine is
 * selected; the app never learns which engine is active.
 */
export function getDictationEngine(input: {
  readonly bridge?: DesktopVoiceBridge;
  readonly tap?: VoicePcmTap;
  readonly getConfig: () => DesktopVoiceConfig;
  readonly decodeRecording?: (uri: string) => Promise<string>;
}): DictationEngine | null {
  if (!input.bridge) return null;
  return createDesktopWhisperDictationEngine({
    bridge: input.bridge,
    getConfig: input.getConfig,
    tap: input.tap,
    decodeRecording: input.decodeRecording,
  });
}
