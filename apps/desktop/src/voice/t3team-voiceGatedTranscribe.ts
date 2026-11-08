// @effect-diagnostics globalDate:off -- Elapsed time is measured around a child-process call.
import type { DesktopVoiceConfig, VoiceTranscriptMetadata } from "@t3tools/contracts";

import {
  languagesToRetry,
  parseAllowedLanguages,
  pickBestTranscript,
} from "./t3team-voiceLanguageChoice.ts";
import type { WhisperHost, WhisperTranscription } from "./t3team-whisperHost.ts";

/** Whisper input is 16 kHz mono 16-bit PCM, so base64 length maps straight to time. */
const pcmMs = (pcm16Base64: string) => Math.round(((pcm16Base64.length * 0.75) / 32_000) * 1000);

export type GatedTranscription = {
  readonly text: string;
  readonly language?: string;
  readonly acceleration: WhisperTranscription["acceleration"];
  readonly device: string;
  readonly elapsedMs: number;
  readonly passMs: number;
  readonly metadata?: VoiceTranscriptMetadata;
};

const metadataOf = (result: WhisperTranscription, audioMs: number): VoiceTranscriptMetadata => ({
  audioMs,
  ...(result.language === undefined ? {} : { language: result.language }),
  words: (result.words ?? []).map((word) => ({
    w: word.text,
    t0: word.t0,
    t1: word.t1,
    ...(word.p === undefined ? {} : { p: word.p }),
  })),
});

/**
 * One whisper pass over audio Silero already found speech in, in the configured (or locked)
 * language. A pass auto-detected outside `voice.transcriber.languages` is run again in each listed
 * language and the fullest transcript wins (the Activity Tracker's de + en fallback); nothing is
 * dropped for its language. Logs timings and languages only, never the text.
 */
export async function transcribeGated(input: {
  readonly host: WhisperHost;
  readonly modelPath: string;
  readonly config: DesktopVoiceConfig;
  readonly pcm16Base64: string;
  readonly log: (message: string) => void;
}): Promise<GatedTranscription> {
  const { host, modelPath, config, pcm16Base64 } = input;
  const startedAt = Date.now();
  const audioMs = pcmMs(pcm16Base64);
  const first = await host.transcribe({ modelPath, pcm16Base64, language: config.language });
  let passMs = first.passMs;
  const retry = languagesToRetry({
    requestedLanguage: config.language,
    detectedLanguage: first.language,
    allowedLanguages: parseAllowedLanguages(config.languages),
  });
  const candidates: WhisperTranscription[] = [];
  for (const language of retry) {
    const forced = await host.transcribe({ modelPath, pcm16Base64, language });
    passMs += forced.passMs;
    candidates.push({ ...forced, language });
  }
  const result = pickBestTranscript(candidates) ?? first;
  if (retry.length > 0) {
    input.log(
      `whisper detected "${first.language}" outside ${retry.join(",")}; re-ran in each, kept ${result.language}`,
    );
  }
  const text = result.text;
  const elapsedMs = Date.now() - startedAt;
  input.log(
    `whisper transcribed ${(audioMs / 1000).toFixed(1)} s of audio in ${elapsedMs} ms (pass ${passMs} ms, ${elapsedMs - passMs} ms waiting; ${result.device}, language ${result.language ?? "unknown"}, ${text.trim().length} chars)`,
  );
  return {
    text,
    ...(result.language === undefined ? {} : { language: result.language }),
    acceleration: result.acceleration,
    device: result.device,
    elapsedMs,
    passMs,
    ...(text.trim() === "" ? {} : { metadata: metadataOf(result, audioMs) }),
  };
}
