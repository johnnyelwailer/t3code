import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { TrimmedNonEmptyString, TrimmedString } from "./baseSchemas.ts";

/** The large tier: what a machine with a discrete GPU uses while `voice.transcriber.model` is empty. */
export const DEFAULT_VOICE_TRANSCRIBER_MODEL = "large-v3-turbo";
export const DEFAULT_VOICE_SILENCE_MS = 1_500;
export const DEFAULT_VOICE_LANGUAGES = "de,en";
export const MAX_VOICE_SILENCE_MS = 10_000;

/** How long the speaker stays silent before the recording commits itself; 0 turns auto-commit off. */
export const VoiceSilenceMs = Schema.Int.check(
  Schema.isBetween({ minimum: 0, maximum: MAX_VOICE_SILENCE_MS }),
);

/**
 * Whisper model and language are settings, never constants. An empty `modelPath` means "detect on
 * disk, else download `model`"; a non-empty `modelPath` is used as-is and always wins. An empty
 * `model` means automatic: the model tier that suits this machine's GPU.
 */
export const VoiceTranscriberSettings = Schema.Struct({
  model: TrimmedString.pipe(Schema.withDecodingDefault(Effect.succeed(""))),
  modelPath: TrimmedString.pipe(Schema.withDecodingDefault(Effect.succeed(""))),
  /**
   * ISO 639-1 code that pins every recording to that language, or `auto` (the default) to let
   * whisper detect the language per recording.
   */
  language: TrimmedNonEmptyString.pipe(Schema.withDecodingDefault(Effect.succeed("auto"))),
  /** Comma-separated ISO 639-1 codes the settings language picker offers after Auto. */
  languages: TrimmedString.pipe(
    Schema.withDecodingDefault(Effect.succeed(DEFAULT_VOICE_LANGUAGES)),
  ),
  silenceMs: VoiceSilenceMs.pipe(
    Schema.withDecodingDefault(Effect.succeed(DEFAULT_VOICE_SILENCE_MS)),
  ),
});
export type VoiceTranscriberSettings = typeof VoiceTranscriberSettings.Type;

export const VoiceSettings = Schema.Struct({
  transcriber: VoiceTranscriberSettings.pipe(Schema.withDecodingDefault(Effect.succeed({}))),
});
export type VoiceSettings = typeof VoiceSettings.Type;

export const VoiceSettingsPatch = Schema.Struct({
  transcriber: Schema.optionalKey(
    Schema.Struct({
      model: Schema.optionalKey(TrimmedString),
      modelPath: Schema.optionalKey(TrimmedString),
      language: Schema.optionalKey(TrimmedNonEmptyString),
      languages: Schema.optionalKey(TrimmedString),
      silenceMs: Schema.optionalKey(VoiceSilenceMs),
    }),
  ),
});
