import * as Schema from "effect/Schema";

/**
 * t3team dictation-engine seam mirroring the dictation contract (`speech.ts`) and the voice-input
 * recognition surface. Types are `t3team`-prefixed so they do not collide with the contract on
 * sync; field names and states mirror the contract so a desktop engine and the environment speech
 * service read as the same engine.
 */

/** Mirrors the contract's speech state: where the model / audio pipeline stands. */
export const DictationEngineState = Schema.Literals(["missing-model", "ready", "transcribing"]);
export type DictationEngineState = typeof DictationEngineState.Type;

/** Mirrors the contract's acceleration choice: `auto`, `cpu`, or a pinned `gpu:<device>`. */
export const DictationEngineAcceleration = Schema.Union([
  Schema.Literal("auto"),
  Schema.Literal("cpu"),
  Schema.String.check(Schema.isPattern(/^gpu:.+/), Schema.isMaxLength(500)),
]);
export type DictationEngineAcceleration = typeof DictationEngineAcceleration.Type;

/** Mirrors the contract's model-unload policy. */
export const DictationEngineModelUnloadTimeout = Schema.Literals([
  "never",
  "immediately",
  "min_2",
  "min_5",
  "min_10",
  "min_15",
  "hour_1",
]);
export type DictationEngineModelUnloadTimeout = typeof DictationEngineModelUnloadTimeout.Type;

export const DictationEngineGpuDevice = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
});
export type DictationEngineGpuDevice = typeof DictationEngineGpuDevice.Type;

/**
 * Mirrors the contract's environment speech status. Only the fields a given engine actually knows
 * are present: an engine without a model catalog omits `languages` / `supportsLanguageDetection` /
 * `supportsBufferedStreaming`, which the contract leaves optional.
 */
export const DictationEngineStatus = Schema.Union([
  Schema.Struct({ supported: Schema.Literal(false), reason: Schema.String }),
  Schema.Struct({
    supported: Schema.Literal(true),
    state: DictationEngineState,
    modelId: Schema.String,
    model: Schema.String,
    size: Schema.Finite,
    supportsStreaming: Schema.Boolean,
    supportsBufferedStreaming: Schema.optionalKey(Schema.Boolean),
    supportsTranslation: Schema.Boolean,
    languages: Schema.optionalKey(Schema.Array(Schema.String)),
    supportsLanguageDetection: Schema.optionalKey(Schema.Boolean),
    acceleration: DictationEngineAcceleration,
    modelUnloadTimeout: DictationEngineModelUnloadTimeout,
    gpuDevices: Schema.Array(DictationEngineGpuDevice),
  }),
]);
export type DictationEngineStatus = typeof DictationEngineStatus.Type;

/** Mirrors the contract's speech-model state. */
export const DictationEngineModelState = Schema.Literals([
  "downloadable",
  "downloading",
  "verifying",
  "installed",
]);
export type DictationEngineModelState = typeof DictationEngineModelState.Type;

/** A catalog entry mirroring the contract's speech model. */
export const DictationEngineModel = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.String,
  size: Schema.Finite,
  languages: Schema.Array(Schema.String),
  accuracy: Schema.Finite,
  speed: Schema.Finite,
  recommended: Schema.Boolean,
  supportsStreaming: Schema.Boolean,
  supportsLanguageDetection: Schema.Boolean,
  supportsTranslation: Schema.Boolean,
  active: Schema.Boolean,
  state: DictationEngineModelState,
  downloaded: Schema.optionalKey(Schema.Finite),
});
export type DictationEngineModel = typeof DictationEngineModel.Type;

export const DictationEngineModels = Schema.Struct({
  models: Schema.Array(DictationEngineModel),
});
export type DictationEngineModels = typeof DictationEngineModels.Type;

/**
 * The transcribe result. The contract's is `{ text }`; a desktop engine may add the extras it
 * measured (detected language, the acceleration and device that ran the pass, timing).
 */
export const DictationEngineTranscriptionResult = Schema.Struct({
  text: Schema.String,
  language: Schema.optionalKey(Schema.String),
  acceleration: Schema.optionalKey(Schema.Literals(["gpu", "cpu"])),
  device: Schema.optionalKey(Schema.String),
  elapsedMs: Schema.optionalKey(Schema.Number),
});
export type DictationEngineTranscriptionResult = typeof DictationEngineTranscriptionResult.Type;

/** Mirrors the contract's stream text (what is settled vs. still being written). */
export const DictationEngineStreamText = Schema.Struct({
  committed: Schema.String,
  tentative: Schema.String,
});
export type DictationEngineStreamText = typeof DictationEngineStreamText.Type;

/** Mirrors the contract's live-stream event (`ready` / `update` / `finished` / `error`). */
export const DictationEngineStreamEvent = Schema.Union([
  Schema.Struct({ type: Schema.Literal("ready") }),
  Schema.Struct({
    type: Schema.Literal("update"),
    revision: Schema.Int,
    text: Schema.NullOr(DictationEngineStreamText),
  }),
  Schema.Struct({ type: Schema.Literal("finished"), text: Schema.String }),
  Schema.Struct({ type: Schema.Literal("error"), message: Schema.String }),
]);
export type DictationEngineStreamEvent = typeof DictationEngineStreamEvent.Type;

/** Cancellation for the recognition calls, mirroring the contract's `VoiceTranscriptionOptions`. */
export type DictationEngineTranscriptionOptions = {
  readonly signal: AbortSignal;
};

/** Mirrors the contract's streaming session: `finish` resolves with the transcript. */
export type DictationEngineStreamingSession = {
  readonly finish: (options: DictationEngineTranscriptionOptions) => Promise<string>;
};

/**
 * The controller-facing prepared transcription, mirroring the voice-input surface's
 * `PreparedVoiceTranscription`. `start` runs alongside capture for a live engine; `streaming`, when
 * present, means `finish` replaces `transcribe` at the end of the recording.
 */
export type DictationEnginePrepared = {
  readonly locale: string;
  readonly start?: (
    uri: string,
    options: DictationEngineTranscriptionOptions,
  ) => Promise<string | null>;
  readonly transcribe: (
    uri: string,
    options: DictationEngineTranscriptionOptions,
  ) => Promise<string>;
  readonly streaming?: DictationEngineStreamingSession;
};

/** The engine's recognition surface, mirroring the voice-input surface's `VoiceTranscriber`. */
export type DictationEngineTranscriber = {
  readonly prepare: (
    options: DictationEngineTranscriptionOptions,
  ) => Promise<DictationEnginePrepared>;
};

/** Mirrors the voice-input surface's error codes. */
export const DictationEngineErrorCode = Schema.Literals([
  "unavailable",
  "unsupported-locale",
  "preparation-failed",
  "transcription-failed",
  "cancelled",
]);
export type DictationEngineErrorCode = typeof DictationEngineErrorCode.Type;
