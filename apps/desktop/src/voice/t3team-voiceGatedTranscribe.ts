// @effect-diagnostics globalDate:off -- Elapsed time is measured around a child-process call.
import type { DesktopVoiceConfig, VoiceTranscriptMetadata } from "@t3tools/contracts";

import { gateTranscript, parseAllowedLanguages } from "./t3team-voiceTranscriptGate.ts";
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

const metadataOf = (
  result: WhisperTranscription,
  audioMs: number,
  speechMs: number | undefined,
): VoiceTranscriptMetadata => ({
  audioMs,
  ...(result.language === undefined ? {} : { language: result.language }),
  ...(speechMs === undefined ? {} : { speechMs }),
  words: (result.words ?? []).map((word) => ({
    w: word.text,
    t0: word.t0,
    t1: word.t1,
    ...(word.p === undefined ? {} : { p: word.p }),
  })),
});

/**
 * One VAD-gated pass, then the transcript gate: what VAD heard as silence, a short pass that
 * noise steered into a language outside the list, or a lone short word becomes "". Long speech
 * detected outside the list is run again in the first allowed language. Logs timings and the
 * verdict only, never the text.
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
  const allowedLanguages = parseAllowedLanguages(config.languages);
  const first = await host.transcribe({
    modelPath,
    pcm16Base64,
    language: config.language,
    vad: true,
  });
  const gateOf = (pass: WhisperTranscription, requestedLanguage: string) =>
    gateTranscript({
      text: pass.text,
      requestedLanguage,
      allowedLanguages,
      audioMs,
      ...(pass.language === undefined ? {} : { language: pass.language }),
      ...(first.speechMs === undefined ? {} : { speechMs: first.speechMs }),
      ...(pass.words === undefined ? {} : { words: pass.words }),
    });
  let result = first;
  let passMs = first.passMs;
  let verdict = gateOf(first, config.language);
  if (verdict.kind === "retry") {
    input.log(
      `whisper detected "${first.language}" outside ${allowedLanguages.join(",")} on ${first.speechMs ?? audioMs} ms of speech; again in ${verdict.language}`,
    );
    const forced = verdict.language;
    result = await host.transcribe({ modelPath, pcm16Base64, language: forced });
    passMs += result.passMs;
    verdict = gateOf(result, forced);
  }
  const dropped = verdict.kind === "drop" ? verdict.reason : null;
  const text = dropped === null ? result.text : "";
  const elapsedMs = Date.now() - startedAt;
  input.log(
    `whisper transcribed ${Math.round(audioMs / 1000)} s of audio in ${elapsedMs} ms (pass ${passMs} ms, ${elapsedMs - passMs} ms waiting; ${result.device}, language ${result.language ?? "unknown"}, speech ${first.speechMs ?? "n/a"} ms, ${text.length} chars${dropped === null ? "" : `, dropped: ${dropped}`})`,
  );
  return {
    text,
    ...(result.language === undefined ? {} : { language: result.language }),
    acceleration: result.acceleration,
    device: result.device,
    elapsedMs,
    passMs,
    ...(text.trim() === "" ? {} : { metadata: metadataOf(result, audioMs, first.speechMs) }),
  };
}
