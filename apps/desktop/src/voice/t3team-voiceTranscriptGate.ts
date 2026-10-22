import type { WhisperWord } from "./t3team-whisperProtocol.ts";

/** Below this much speech, a pass detected in a language outside the list is noise, not a new language. */
const FOREIGN_NOISE_SPEECH_MS = 1_500;
/** A single word out of under this much speech is far more often a whisper guess than a word. */
const LONE_WORD_SPEECH_MS = 400;

export type TranscriptGateInput = {
  readonly text: string;
  /** Language whisper used: the forced one, or what it detected on `auto`. */
  readonly language?: string;
  /** The language the pass ran with: `auto` or a code. */
  readonly requestedLanguage: string;
  /** `voice.transcriber.languages`, lower-case ISO 639-1 codes; empty means any. */
  readonly allowedLanguages: readonly string[];
  /** Speech VAD heard; absent when VAD did not run. */
  readonly speechMs?: number;
  readonly audioMs: number;
  readonly words?: readonly WhisperWord[];
};

export type TranscriptGateVerdict =
  | { readonly kind: "keep" }
  | { readonly kind: "drop"; readonly reason: "no-speech" | "foreign-noise" | "lone-word" }
  /** Detected outside the allowed list with real speech in it: run it again in `language`. */
  | { readonly kind: "retry"; readonly language: string };

export function parseAllowedLanguages(languages: string | undefined): readonly string[] {
  return (languages ?? "")
    .split(",")
    .map((code) => code.trim().toLowerCase())
    .filter((code) => /^[a-z]{2,3}$/.test(code));
}

/**
 * Decides whether a whisper pass is speech worth sending. Text-pattern junk (loops, the known
 * "thanks for watching" phrases) is the renderer's `sanitizeTranscript`; this gate owns what only
 * the main process knows: VAD's verdict, the detected language and the audio's length.
 */
export function gateTranscript(input: TranscriptGateInput): TranscriptGateVerdict {
  if (input.speechMs === 0) return { kind: "drop", reason: "no-speech" };
  if (input.text.trim() === "") return { kind: "keep" };
  const speechMs = input.speechMs ?? input.audioMs;
  const detected = input.language?.toLowerCase();
  if (
    input.requestedLanguage === "auto" &&
    input.allowedLanguages.length > 0 &&
    detected !== undefined &&
    !input.allowedLanguages.includes(detected)
  ) {
    return speechMs < FOREIGN_NOISE_SPEECH_MS
      ? { kind: "drop", reason: "foreign-noise" }
      : { kind: "retry", language: input.allowedLanguages[0]! };
  }
  const wordCount = input.words?.length ?? input.text.trim().split(/\s+/).length;
  if (input.speechMs !== undefined && wordCount <= 1 && input.speechMs < LONE_WORD_SPEECH_MS) {
    return { kind: "drop", reason: "lone-word" };
  }
  return { kind: "keep" };
}
