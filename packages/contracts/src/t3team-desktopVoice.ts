import * as Schema from "effect/Schema";
import * as Struct from "effect/Struct";

import { VoiceTranscriberSettings } from "./t3team-voiceSettings.ts";

/** Whisper takes 16 kHz mono signed 16-bit PCM; the renderer resamples before it crosses IPC. */
export const DESKTOP_VOICE_SAMPLE_RATE = 16_000;
export const DESKTOP_VOICE_MAX_PCM_BYTES = DESKTOP_VOICE_SAMPLE_RATE * 2 * 5 * 60;

export const DesktopVoiceModelSource = Schema.Literals([
  "setting",
  "app-models",
  "activity-tracker",
  "download",
]);
export type DesktopVoiceModelSource = typeof DesktopVoiceModelSource.Type;

export const DesktopVoiceFailureCode = Schema.Literals([
  "runtime-unavailable",
  "model-unavailable",
  "transcription-failed",
]);
export type DesktopVoiceFailureCode = typeof DesktopVoiceFailureCode.Type;

const DesktopVoiceFailure = Schema.Struct({
  ok: Schema.Literal(false),
  code: DesktopVoiceFailureCode,
  message: Schema.String,
});

/** What the transcriber needs; `languages` only feeds the settings picker, so it never crosses IPC. */
export const DesktopVoiceConfig = VoiceTranscriberSettings.mapFields(Struct.omit(["languages"]));
export type DesktopVoiceConfig = typeof DesktopVoiceConfig.Type;

/** Main to renderer while the first-use model download runs; `totalBytes` is null when the server sent no length. */
export const DesktopVoiceModelProgress = Schema.Struct({
  receivedBytes: Schema.Number,
  totalBytes: Schema.NullOr(Schema.Number),
});
export type DesktopVoiceModelProgress = typeof DesktopVoiceModelProgress.Type;

export const DesktopVoicePrepareRequest = Schema.Struct({
  config: DesktopVoiceConfig,
  /** Without this, a missing model is reported instead of fetched (status probe). */
  allowDownload: Schema.Boolean,
});

export type DesktopVoicePrepareRequest = typeof DesktopVoicePrepareRequest.Type;

export const DesktopVoicePrepareResult = Schema.Union([
  Schema.Struct({
    ok: Schema.Literal(true),
    modelPath: Schema.String,
    modelSource: DesktopVoiceModelSource,
  }),
  DesktopVoiceFailure,
]);
export type DesktopVoicePrepareResult = typeof DesktopVoicePrepareResult.Type;

export const DesktopVoiceTranscribeRequest = Schema.Struct({
  config: DesktopVoiceConfig,
  pcm16Base64: Schema.String.check(
    Schema.isMaxLength(Math.ceil(DESKTOP_VOICE_MAX_PCM_BYTES * 1.4)),
  ),
});

export type DesktopVoiceTranscribeRequest = typeof DesktopVoiceTranscribeRequest.Type;

export const DesktopVoiceTranscribeResult = Schema.Union([
  Schema.Struct({
    ok: Schema.Literal(true),
    text: Schema.String,
    language: Schema.optionalKey(Schema.String),
    acceleration: Schema.Literals(["gpu", "cpu"]),
    elapsedMs: Schema.Number,
  }),
  DesktopVoiceFailure,
]);
export type DesktopVoiceTranscribeResult = typeof DesktopVoiceTranscribeResult.Type;
