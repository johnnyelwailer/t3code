import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { TrimmedNonEmptyString, TrimmedString } from "./baseSchemas.ts";

export const DEFAULT_VOICE_TRANSCRIBER_MODEL = "large-v3-turbo";

/**
 * Whisper model and language are settings, never constants. An empty `modelPath` means "detect on
 * disk, else download `model`"; a non-empty `modelPath` is used as-is and always wins.
 */
export const VoiceTranscriberSettings = Schema.Struct({
  model: TrimmedNonEmptyString.pipe(
    Schema.withDecodingDefault(Effect.succeed(DEFAULT_VOICE_TRANSCRIBER_MODEL)),
  ),
  modelPath: TrimmedString.pipe(Schema.withDecodingDefault(Effect.succeed(""))),
  /** ISO 639-1 code, or `auto` to let whisper detect the language per recording. */
  language: TrimmedNonEmptyString.pipe(Schema.withDecodingDefault(Effect.succeed("auto"))),
});
export type VoiceTranscriberSettings = typeof VoiceTranscriberSettings.Type;

export const VoiceSettings = Schema.Struct({
  transcriber: VoiceTranscriberSettings.pipe(Schema.withDecodingDefault(Effect.succeed({}))),
});
export type VoiceSettings = typeof VoiceSettings.Type;

export const VoiceSettingsPatch = Schema.Struct({
  transcriber: Schema.optionalKey(
    Schema.Struct({
      model: Schema.optionalKey(TrimmedNonEmptyString),
      modelPath: Schema.optionalKey(TrimmedString),
      language: Schema.optionalKey(TrimmedNonEmptyString),
    }),
  ),
});
