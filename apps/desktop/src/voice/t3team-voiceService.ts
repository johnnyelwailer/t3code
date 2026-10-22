// @effect-diagnostics nodeBuiltinImport:off -- Plain-Node service owned by the whisper host.
import * as NodeFS from "node:fs";

import type {
  DesktopVoiceConfig,
  DesktopVoiceModelProgress,
  DesktopVoicePrepareResult,
  DesktopVoiceTranscribeResult,
  VoiceTranscriptMetadata,
} from "@t3tools/contracts";

import { transcribeGated } from "./t3team-voiceGatedTranscribe.ts";
import { makeVoiceWarmup, type VoiceWarmupStage } from "./t3team-voiceWarmup.ts";
import { makeVadModelEnsurer } from "./t3team-whisperVadModel.ts";

import { downloadWhisperModel } from "./t3team-whisperModelDownload.ts";
import {
  defaultWhisperModelFor,
  LARGE_TIER_WHISPER_MODEL,
  FULL_LARGE_WHISPER_MODEL,
  MID_TIER_WHISPER_MODEL,
  SMALL_TIER_WHISPER_MODEL,
} from "./t3team-whisperDefaultModel.ts";
import {
  isValidWhisperModelId,
  locateWhisperModel,
  type WhisperModelLocatorEnvironment,
} from "./t3team-whisperModelLocator.ts";
import type { WhisperHost } from "./t3team-whisperHost.ts";

/** The IPC result plus, on success, the worker's own time for the pass (see `WhisperTranscription`). */
export type DesktopVoiceTranscription =
  | (Extract<DesktopVoiceTranscribeResult, { ok: true }> & {
      readonly passMs: number;
      /** Whisper's word timings and VAD verdict; absent when nothing was kept. */
      readonly metadata?: VoiceTranscriptMetadata;
    })
  | Extract<DesktopVoiceTranscribeResult, { ok: false }>;

export type { VoiceWarmupStage } from "./t3team-voiceWarmup.ts";

export type DesktopVoiceService = {
  /** Best-effort model load plus one throwaway pass; concurrent calls share one warm-up. */
  readonly warm: (config: DesktopVoiceConfig) => Promise<void>;
  /** The running warm-up's stage, or null when none runs. */
  readonly warmupStage: () => VoiceWarmupStage | null;
  /** True once the worker is loaded and has run a pass, so a pass now would not wait on a cold start. */
  readonly isReady: () => boolean;
  readonly prepare: (input: {
    readonly config: DesktopVoiceConfig;
    readonly allowDownload: boolean;
  }) => Promise<DesktopVoicePrepareResult>;
  readonly transcribe: (input: {
    readonly config: DesktopVoiceConfig;
    readonly pcm16Base64: string;
  }) => Promise<DesktopVoiceTranscription>;
};

type ModelResolution = Extract<DesktopVoicePrepareResult, { ok: true }>;

const failure = (code: "runtime-unavailable" | "model-unavailable", message: string) =>
  ({ ok: false, code, message }) as const;

export function makeDesktopVoiceService(deps: {
  readonly environment: WhisperModelLocatorEnvironment;
  readonly host: WhisperHost;
  readonly isRuntimeAvailable: () => boolean;
  readonly download?: typeof downloadWhisperModel;
  readonly onDownloadProgress?: (progress: DesktopVoiceModelProgress) => void;
  /** Silero VAD model on disk, and how to fetch it once; without it passes are not VAD-gated. */
  readonly vadModel?: {
    readonly locate: () => string | null;
    readonly download: () => Promise<string>;
  };
  readonly log?: (message: string) => void;
}): DesktopVoiceService {
  const log = deps.log ?? (() => undefined);
  const download = deps.download ?? downloadWhisperModel;
  const downloadsInFlight = new Map<string, Promise<string>>();

  /** A second request joins a running download: two writers on one `.part` file corrupt it. */
  const downloadOnce = (model: string): Promise<string> => {
    const running = downloadsInFlight.get(model);
    if (running !== undefined) return running;
    const started = download({
      model,
      targetDir: deps.environment.appModelsDir,
      ...(deps.onDownloadProgress ? { onProgress: deps.onDownloadProgress } : {}),
    }).finally(() => downloadsInFlight.delete(model));
    downloadsInFlight.set(model, started);
    return started;
  };

  const resolveNamedModel = async (
    model: string,
    allowDownload: boolean,
    exact = false,
  ): Promise<ModelResolution | ReturnType<typeof failure>> => {
    const found = locateWhisperModel({ model }, deps.environment, { exact });
    if (found) return { ok: true, ...found };
    if (!isValidWhisperModelId(model)) {
      return failure("model-unavailable", `"${model}" is not a valid whisper model id.`);
    }
    if (!allowDownload) {
      return failure(
        "model-unavailable",
        `No whisper model "${model}" found; it is downloaded on first use.`,
      );
    }
    try {
      const modelPath = await downloadOnce(model);
      return { ok: true, modelPath, modelSource: "download" };
    } catch (error) {
      return failure("model-unavailable", error instanceof Error ? error.message : String(error));
    }
  };

  let lastChoice = "";
  const chose = (resolution: ModelResolution, reason: string): ModelResolution => {
    const choice = `${resolution.modelPath} (${resolution.modelSource}): ${reason}`;
    if (choice !== lastChoice) log(`whisper model for dictation: ${choice}`);
    lastChoice = choice;
    return resolution;
  };

  /**
   * No model configured: `large-v3-turbo` on disk first. Otherwise `base` (fetched if missing)
   * probes the device: a discrete GPU gets the full `large-v3` already on disk (the tracker's; with
   * 2 threads its passes stay under realtime there) or a downloaded turbo; others get `small` on
   * disk, else `base`. Every choice is logged with its reason.
   */
  const resolveAutomaticModel = async (
    allowDownload: boolean,
  ): Promise<ModelResolution | ReturnType<typeof failure>> => {
    const env = deps.environment;
    const onDisk = (model: string) => locateWhisperModel({ model }, env, { exact: true });
    const turbo = onDisk(LARGE_TIER_WHISPER_MODEL);
    if (turbo) return chose({ ok: true, ...turbo }, "large-v3-turbo on disk");
    const small = await resolveNamedModel(SMALL_TIER_WHISPER_MODEL, allowDownload, true);
    if (!small.ok) return small;
    const device = await deps.host.probeDevice(small.modelPath).catch(() => null);
    if (device && defaultWhisperModelFor(device.kind) === LARGE_TIER_WHISPER_MODEL) {
      // Measured on an RTX 5070: large-v3 passes stay under realtime (short ones ~0.2 s), so a
      // discrete GPU may stream it; an iGPU or the CPU never gets it.
      const full = onDisk(FULL_LARGE_WHISPER_MODEL);
      if (full) return chose({ ok: true, ...full }, "large-v3 on disk, discrete GPU");
      const large = await resolveNamedModel(LARGE_TIER_WHISPER_MODEL, allowDownload, true);
      if (large.ok) return chose(large, "large-v3-turbo for the discrete GPU");
    }
    const mid = onDisk(MID_TIER_WHISPER_MODEL);
    if (mid) return chose({ ok: true, ...mid }, "small on disk (no discrete GPU for large)");
    return chose(small, "base (no faster good model on disk)");
  };

  const resolveModel = async (
    config: DesktopVoiceConfig,
    allowDownload: boolean,
  ): Promise<ModelResolution | ReturnType<typeof failure>> => {
    if (!deps.isRuntimeAvailable()) {
      return failure("runtime-unavailable", "The whisper runtime is not installed in this build.");
    }
    if (config.modelPath !== "") {
      return NodeFS.existsSync(config.modelPath)
        ? { ok: true, modelPath: config.modelPath, modelSource: "setting" }
        : failure(
            "model-unavailable",
            `voice.transcriber.modelPath points to a file that does not exist: ${config.modelPath}`,
          );
    }
    return config.model === ""
      ? resolveAutomaticModel(allowDownload)
      : resolveNamedModel(config.model, allowDownload);
  };

  const warmup = makeVoiceWarmup<DesktopVoiceConfig>({
    host: deps.host,
    ensureVadModel: makeVadModelEnsurer(deps.vadModel, log),
    resolveModelPath: async (config) => {
      const resolved = await resolveModel(config, false);
      return resolved.ok ? resolved.modelPath : null;
    },
    log,
  });
  const warm = warmup.warm;

  return {
    warm,
    warmupStage: warmup.stage,
    isReady: () => deps.host.isReady(),
    prepare: async ({ config, allowDownload }) => {
      const resolved = await resolveModel(config, allowDownload);
      // Warm as soon as a model resolves, even on the composer's mount probe (which never
      // downloads), so the load is done before the first press, as the tracker loads at start.
      if (resolved.ok) void warm(config);
      return resolved;
    },
    transcribe: async ({ config, pcm16Base64 }) => {
      const resolved = await resolveModel(config, false);
      if (!resolved.ok) return resolved;
      try {
        const pass = await transcribeGated({
          host: deps.host,
          modelPath: resolved.modelPath,
          config,
          pcm16Base64,
          log,
        });
        return { ok: true, ...pass };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log(`whisper transcription failed: ${message}`);
        return { ok: false, code: "transcription-failed", message };
      }
    },
  };
}
