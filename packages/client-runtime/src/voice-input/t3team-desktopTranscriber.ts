import type {
  DesktopVoiceConfig,
  DesktopVoicePrepareResult,
  DesktopVoiceStreamStopResult,
  DesktopVoiceTranscribeResult,
} from "@t3tools/contracts";

import { sanitizeTranscript } from "./t3team-transcriptQuality.ts";
import {
  VoiceTranscriptionError,
  throwIfVoiceTranscriptionAborted,
  type VoiceTranscriber,
} from "./transcription.ts";

/** Structural subset of the desktop preload bridge, so this package never imports the app. */
export type DesktopVoiceBridge = {
  readonly prepareVoiceTranscriber: (request: {
    readonly config: DesktopVoiceConfig;
    readonly allowDownload: boolean;
  }) => Promise<DesktopVoicePrepareResult>;
  readonly transcribeVoice: (request: {
    readonly config: DesktopVoiceConfig;
    readonly pcm16Base64: string;
  }) => Promise<DesktopVoiceTranscribeResult>;
};

/** Turns a finished recording into 16 kHz mono signed 16-bit PCM, base64 encoded. */
export type DesktopVoiceRecordingDecoder = (uri: string) => Promise<string>;

/**
 * Transcriber for the Electron desktop app. With a live session, the stream already wrote down every
 * utterance while the recording ran, so finishing asks it for the rest (what was said after the last
 * utterance) and never touches the recording. Without one, the recording becomes one `transcribe`
 * call on the native whisper host in the main process. The model and language come from `getConfig`
 * (server settings), never from constants here.
 */
export function createDesktopVoiceTranscriber(input: {
  readonly bridge: DesktopVoiceBridge;
  readonly getConfig: () => DesktopVoiceConfig;
  readonly decodeRecording: DesktopVoiceRecordingDecoder;
  /** Ends the live session; null when the recording had none. */
  readonly finishLiveSession?: () => Promise<DesktopVoiceStreamStopResult | null>;
}): VoiceTranscriber {
  return {
    prepare: async (options) => {
      throwIfVoiceTranscriptionAborted(options.signal);
      const config = input.getConfig();
      const prepared = await input.bridge.prepareVoiceTranscriber({ config, allowDownload: true });
      throwIfVoiceTranscriptionAborted(options.signal);
      if (!prepared.ok) {
        throw new VoiceTranscriptionError(
          prepared.code === "runtime-unavailable" ? "unavailable" : "model-unavailable",
          prepared.message,
        );
      }
      return {
        locale: config.language,
        transcribe: async (uri, transcribeOptions) => {
          throwIfVoiceTranscriptionAborted(transcribeOptions.signal);
          const live = await input.finishLiveSession?.();
          throwIfVoiceTranscriptionAborted(transcribeOptions.signal);
          if (live) {
            if (live.error !== undefined) {
              throw new VoiceTranscriptionError("transcription-failed", live.error);
            }
            return sanitizeTranscript(live.text);
          }
          const pcm16Base64 = await input.decodeRecording(uri);
          throwIfVoiceTranscriptionAborted(transcribeOptions.signal);
          const result = await input.bridge.transcribeVoice({
            config: input.getConfig(),
            pcm16Base64,
          });
          throwIfVoiceTranscriptionAborted(transcribeOptions.signal);
          if (!result.ok) throw new VoiceTranscriptionError("transcription-failed", result.message);
          return sanitizeTranscript(result.text);
        },
      };
    },
  };
}
