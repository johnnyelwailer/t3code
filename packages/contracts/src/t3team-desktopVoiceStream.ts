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

/**
 * Ends a recording's stream. With `finish`, speech not yet committed as an utterance is
 * transcribed first and every utterance still being written is awaited, so nothing said is lost.
 */
export const DesktopVoiceStreamStopRequest = Schema.Struct({
  sessionId: Schema.String,
  finish: Schema.optionalKey(Schema.Boolean),
});
export type DesktopVoiceStreamStopRequest = typeof DesktopVoiceStreamStopRequest.Type;

/**
 * `text` is the transcript of what was said after the last committed utterance (empty when nothing
 * was), `committed` how many utterances the stream committed on its own during the recording.
 */
export const DesktopVoiceStreamStopResult = Schema.Struct({
  text: Schema.String,
  committed: Schema.Number,
  error: Schema.optionalKey(Schema.String),
});
export type DesktopVoiceStreamStopResult = typeof DesktopVoiceStreamStopResult.Type;

/**
 * What whisper knew about one transcript beyond its text, kept small: word timings in ms from the
 * start of the utterance, the detected language and how much of the audio VAD heard as speech.
 * `p` (word probability) and `noSpeechProb` stay absent while the native runtime does not report
 * them, so a consumer must never read a missing `p` as "certain".
 */
export const VoiceTranscriptWord = Schema.Struct({
  w: Schema.String,
  t0: Schema.Number,
  t1: Schema.Number,
  p: Schema.optionalKey(Schema.Number),
});
export type VoiceTranscriptWord = typeof VoiceTranscriptWord.Type;

export const VoiceTranscriptMetadata = Schema.Struct({
  language: Schema.optionalKey(Schema.String),
  audioMs: Schema.Number,
  speechMs: Schema.optionalKey(Schema.Number),
  noSpeechProb: Schema.optionalKey(Schema.Number),
  words: Schema.Array(VoiceTranscriptWord),
});
export type VoiceTranscriptMetadata = typeof VoiceTranscriptMetadata.Type;

export const DesktopVoiceWarmupStage = Schema.Literals(["loading", "preparing-gpu", "ready"]);
export type DesktopVoiceWarmupStage = typeof DesktopVoiceWarmupStage.Type;

/** `silence` ends an utterance and the recording goes on; `no-speech` and `idle` end the recording. */
export const DesktopVoiceStreamAutoCommitReason = Schema.Literals(["silence", "no-speech", "idle"]);
export type DesktopVoiceStreamAutoCommitReason = typeof DesktopVoiceStreamAutoCommitReason.Type;

/**
 * Main to renderer while a recording streams. `level` is 0-1 input loudness, `partial` the
 * transcript of the utterance so far, `language` the language the session locked to.
 * `auto-commit` says the speaker paused: for `silence` the utterance is now being written and the
 * recording stays open, for `no-speech` and `idle` the renderer ends it. `utterance` is the
 * written text of one committed utterance (empty when it held no words) and `utterance-failed`
 * says writing it down failed. `warmup` repeats while the model loads and runs its first
 * (shader-compiling) pass; audio keeps being captured and is transcribed once it is `ready`.
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
  Schema.Struct({
    sessionId: Schema.String,
    type: Schema.Literal("utterance"),
    text: Schema.String,
    elapsedMs: Schema.Number,
    metadata: Schema.optionalKey(VoiceTranscriptMetadata),
  }),
  Schema.Struct({
    sessionId: Schema.String,
    type: Schema.Literal("utterance-failed"),
    message: Schema.String,
  }),
  Schema.Struct({
    sessionId: Schema.String,
    type: Schema.Literal("warmup"),
    stage: DesktopVoiceWarmupStage,
    /** 0-100, coarse: it moves per stage, never pretends to know more. */
    percent: Schema.Number,
  }),
]);
export type DesktopVoiceStreamEvent = typeof DesktopVoiceStreamEvent.Type;
