import * as Schema from "effect/Schema";

import { DesktopVoiceConfig, DesktopVoiceFailureCode } from "./t3team-desktopVoice.ts";

/** One renderer push is ~100-250 ms of audio; the cap only guards against a runaway producer. */
export const DESKTOP_VOICE_STREAM_MAX_CHUNK_BYTES = 16_000 * 2 * 2;

export const DesktopVoiceStreamStartRequest = Schema.Struct({ config: DesktopVoiceConfig });
export type DesktopVoiceStreamStartRequest = typeof DesktopVoiceStreamStartRequest.Type;

export const DesktopVoiceStreamStartResult = Schema.Union([
  Schema.Struct({ ok: Schema.Literal(true), sessionId: Schema.String }),
  Schema.Struct({
    ok: Schema.Literal(false),
    code: DesktopVoiceFailureCode,
    message: Schema.String,
  }),
]);
export type DesktopVoiceStreamStartResult = typeof DesktopVoiceStreamStartResult.Type;

/** 16 kHz mono signed 16-bit PCM, base64; chunks arrive in recording order. */
export const DesktopVoiceStreamPushRequest = Schema.Struct({
  sessionId: Schema.String,
  pcm16Base64: Schema.String.check(
    Schema.isMaxLength(Math.ceil(DESKTOP_VOICE_STREAM_MAX_CHUNK_BYTES * 1.4)),
  ),
});
export type DesktopVoiceStreamPushRequest = typeof DesktopVoiceStreamPushRequest.Type;

export const DesktopVoiceStreamStopRequest = Schema.Struct({ sessionId: Schema.String });
export type DesktopVoiceStreamStopRequest = typeof DesktopVoiceStreamStopRequest.Type;

export const DesktopVoiceStreamAutoCommitReason = Schema.Literals(["silence", "no-speech"]);
export type DesktopVoiceStreamAutoCommitReason = typeof DesktopVoiceStreamAutoCommitReason.Type;

/**
 * Main to renderer while a recording streams. `level` is 0-1 input loudness, `partial` the
 * transcript of the utterance so far, `language` the language the session locked to, and
 * `auto-commit` the signal that the speaker stopped, so the renderer ends the recording.
 */
export const DesktopVoiceStreamEvent = Schema.Union([
  Schema.Struct({ sessionId: Schema.String, type: Schema.Literal("level"), level: Schema.Number }),
  Schema.Struct({
    sessionId: Schema.String,
    type: Schema.Literal("partial"),
    text: Schema.String,
    elapsedMs: Schema.Number,
  }),
  Schema.Struct({
    sessionId: Schema.String,
    type: Schema.Literal("language"),
    language: Schema.String,
  }),
  Schema.Struct({
    sessionId: Schema.String,
    type: Schema.Literal("auto-commit"),
    reason: DesktopVoiceStreamAutoCommitReason,
  }),
]);
export type DesktopVoiceStreamEvent = typeof DesktopVoiceStreamEvent.Type;
