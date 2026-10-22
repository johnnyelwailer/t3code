import type { VoiceTranscriptMetadata } from "@t3tools/contracts";

export const VOICE_TRANSCRIPT_META_FILE_NAME = "transcript-meta.json";
/** A long dictation's word list stays well under this; anything bigger is cut, not sent whole. */
const MAX_WORDS = 600;

/**
 * Whisper's metadata for one voice message, as the small JSON file the message carries as an
 * attachment (a chip, like any other file): the agent opens it when a word is ambiguous or it
 * needs timing, and the message text stays exactly what was said. Times are ms from the start of
 * the utterance. `p` and `noSpeechProb` are only present when whisper reported them.
 */
export function voiceTranscriptMetaJson(metadata: VoiceTranscriptMetadata): string {
  const words = metadata.words.slice(0, MAX_WORDS);
  return JSON.stringify({
    kind: "voice-transcript-meta",
    version: 1,
    ...(metadata.language === undefined ? {} : { language: metadata.language }),
    audioMs: Math.round(metadata.audioMs),
    ...(metadata.speechMs === undefined ? {} : { speechMs: Math.round(metadata.speechMs) }),
    ...(metadata.noSpeechProb === undefined ? {} : { noSpeechProb: metadata.noSpeechProb }),
    ...(words.length < metadata.words.length ? { truncatedWords: metadata.words.length } : {}),
    words: words.map((word) => ({
      w: word.w,
      t0: Math.round(word.t0),
      t1: Math.round(word.t1),
      ...(word.p === undefined ? {} : { p: Math.round(word.p * 100) / 100 }),
    })),
  });
}

export function voiceTranscriptMetaFile(metadata: VoiceTranscriptMetadata): File {
  return new File([voiceTranscriptMetaJson(metadata)], VOICE_TRANSCRIPT_META_FILE_NAME, {
    type: "application/json",
  });
}
