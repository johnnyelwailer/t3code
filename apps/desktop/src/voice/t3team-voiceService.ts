// @effect-diagnostics nodeBuiltinImport:off -- Plain-Node service owned by the whisper host.
// @effect-diagnostics globalDate:off -- Elapsed time is measured around a child-process call.
import * as NodeFS from "node:fs";

import type {
  DesktopVoiceConfig,
  DesktopVoiceModelProgress,
  DesktopVoicePrepareResult,
  DesktopVoiceTranscribeResult,
} from "@t3tools/contracts";

import { downloadWhisperModel } from "./t3team-whisperModelDownload.ts";
import {
  isValidWhisperModelId,
  locateWhisperModel,
  type WhisperModelLocatorEnvironment,
} from "./t3team-whisperModelLocator.ts";
import type { WhisperHost } from "./t3team-whisperHost.ts";

export type DesktopVoiceService = {
  /** Best-effort model load; a failure surfaces on the first transcription instead. */
  readonly warm: (config: DesktopVoiceConfig) => Promise<void>;
  readonly prepare: (input: {
    readonly config: DesktopVoiceConfig;
    readonly allowDownload: boolean;
  }) => Promise<DesktopVoicePrepareResult>;
  readonly transcribe: (input: {
    readonly config: DesktopVoiceConfig;
    readonly pcm16Base64: string;
  }) => Promise<DesktopVoiceTranscribeResult>;
};

type ModelResolution = Extract<DesktopVoicePrepareResult, { ok: true }>;

/** Whisper input is 16 kHz mono 16-bit PCM, so base64 length maps straight to seconds. */
const pcmSeconds = (pcm16Base64: string) => Math.round((pcm16Base64.length * 0.75) / 32_000);

const failure = (code: "runtime-unavailable" | "model-unavailable", message: string) =>
  ({ ok: false, code, message }) as const;

export function makeDesktopVoiceService(deps: {
  readonly environment: WhisperModelLocatorEnvironment;
  readonly host: WhisperHost;
  readonly isRuntimeAvailable: () => boolean;
  readonly download?: typeof downloadWhisperModel;
  readonly onDownloadProgress?: (progress: DesktopVoiceModelProgress) => void;
  readonly log?: (message: string) => void;
}): DesktopVoiceService {
  const log = deps.log ?? (() => undefined);
  const download = deps.download ?? downloadWhisperModel;

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
    const found = locateWhisperModel(config, deps.environment);
    if (found) return { ok: true, ...found };
    if (!isValidWhisperModelId(config.model)) {
      return failure("model-unavailable", `"${config.model}" is not a valid whisper model id.`);
    }
    if (!allowDownload) {
      return failure(
        "model-unavailable",
        `No whisper model "${config.model}" found; it is downloaded on first use.`,
      );
    }
    try {
      const modelPath = await download({
        model: config.model,
        targetDir: deps.environment.appModelsDir,
        ...(deps.onDownloadProgress ? { onProgress: deps.onDownloadProgress } : {}),
      });
      return { ok: true, modelPath, modelSource: "download" };
    } catch (error) {
      return failure("model-unavailable", error instanceof Error ? error.message : String(error));
    }
  };

  return {
    warm: async (config) => {
      const resolved = await resolveModel(config, false);
      if (!resolved.ok) return;
      await deps.host.warm(resolved.modelPath).catch((error: unknown) => {
        log(`whisper warm-up failed: ${String(error)}`);
      });
    },
    prepare: async ({ config, allowDownload }) => {
      const resolved = await resolveModel(config, allowDownload);
      if (resolved.ok) log(`whisper model: ${resolved.modelPath} (${resolved.modelSource})`);
      return resolved;
    },
    transcribe: async ({ config, pcm16Base64 }) => {
      const resolved = await resolveModel(config, false);
      if (!resolved.ok) return resolved;
      const startedAt = Date.now();
      try {
        const result = await deps.host.transcribe({
          modelPath: resolved.modelPath,
          pcm16Base64,
          language: config.language,
        });
        const elapsedMs = Date.now() - startedAt;
        log(
          `whisper transcribed ${pcmSeconds(pcm16Base64)} s of audio in ${elapsedMs} ms (${result.acceleration}, language ${result.language ?? "unknown"}, ${result.text.length} chars)`,
        );
        return { ok: true, ...result, elapsedMs };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log(`whisper transcription failed: ${message}`);
        return { ok: false, code: "transcription-failed", message };
      }
    },
  };
}
