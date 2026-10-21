import type { DesktopVoiceStreamEvent } from "@t3tools/contracts";

import { createActivityGate, SPEECH_FLOOR_RMS } from "./t3team-voiceActivityGate.ts";
import { createLanguageLock } from "./t3team-voiceLanguageLock.ts";
import {
  concatPcm16,
  msToSamples,
  pcm16Rms,
  pcm16ToBase64,
  samplesToMs,
} from "./t3team-voicePcm.ts";

/** Partials come at most this often; a slow transcription stretches the gap (see `nextPartialGapMs`). */
const PARTIAL_INTERVAL_MS = 2_000;
/** A partial re-transcribes the utterance so far, capped to its most recent stretch. */
const PARTIAL_WINDOW_MS = 15_000;
const PRE_ROLL_MS = 300;
/** A partial slower than this ends partials for the session: stale text is worthless and a busy worker delays the final pass. */
const PARTIAL_BUDGET_MS = 8_000;

export type VoiceStreamTranscription =
  | {
      readonly ok: true;
      readonly text: string;
      readonly language?: string;
      readonly elapsedMs: number;
    }
  | { readonly ok: false; readonly message: string };

type WithoutSession<T> = T extends unknown ? Omit<T, "sessionId"> : never;
export type VoiceStreamEmit = (event: WithoutSession<DesktopVoiceStreamEvent>) => void;

/**
 * One recording's live pipeline. Chunks drive everything, so it needs no timers: the activity gate
 * reports levels and decides when the speaker stopped, and while someone is speaking a partial
 * pass re-transcribes the utterance so far. A pass never starts while another is running, the gap
 * after it grows with its duration, and a pass over the budget ends partials for the session, so a
 * slow model cannot queue work ahead of the final pass.
 */
export function createVoiceStreamSession(deps: {
  readonly configuredLanguage: string;
  readonly silenceMs: number;
  readonly transcribe: (input: {
    readonly pcm16Base64: string;
    readonly language: string;
  }) => Promise<VoiceStreamTranscription>;
  readonly emit: VoiceStreamEmit;
  readonly log: (message: string) => void;
}) {
  const gate = createActivityGate({ silenceMs: deps.silenceMs });
  const language = createLanguageLock(deps.configuredLanguage);
  const chunks: Int16Array[] = [];
  let totalSamples = 0;
  let utteranceStart: number | null = null;
  let lastPartialAtMs = Number.NEGATIVE_INFINITY;
  let lastPartialElapsedMs = 0;
  let inFlight = false;
  let stopped = false;
  let committed = false;
  let partialsEnabled = true;
  let partialCount = 0;
  let chunkCount = 0;

  const nextPartialGapMs = () => Math.max(PARTIAL_INTERVAL_MS, lastPartialElapsedMs);

  function runPartial() {
    const end = totalSamples;
    const start = Math.max(utteranceStart ?? 0, end - msToSamples(PARTIAL_WINDOW_MS));
    const window = concatPcm16(chunks, start, end);
    if (pcm16Rms(window) < SPEECH_FLOOR_RMS) return;
    inFlight = true;
    lastPartialAtMs = samplesToMs(end);
    void deps
      .transcribe({ pcm16Base64: pcm16ToBase64(window), language: language.current() })
      .then((result) => {
        if (stopped) return;
        if (!result.ok) return deps.log(`stream partial failed: ${result.message}`);
        lastPartialElapsedMs = result.elapsedMs;
        if (result.elapsedMs > PARTIAL_BUDGET_MS) {
          partialsEnabled = false;
          deps.log(
            `stream partials off: a pass took ${result.elapsedMs} ms (budget ${PARTIAL_BUDGET_MS} ms)`,
          );
        }
        partialCount += 1;
        if (partialCount === 1) {
          deps.log(
            `stream first partial: ${result.elapsedMs} ms to transcribe, ${Math.round(samplesToMs(end))} ms of audio`,
          );
        }
        if (result.text.trim() !== "") {
          deps.emit({ type: "partial", text: result.text, elapsedMs: result.elapsedMs });
          const locked = language.vote(result.language);
          if (locked !== null) {
            deps.log(`stream language locked: ${locked}`);
            deps.emit({ type: "language", language: locked });
          }
        }
      })
      .catch((error: unknown) => deps.log(`stream partial failed: ${String(error)}`))
      .finally(() => {
        inFlight = false;
      });
  }

  return {
    push(chunk: Int16Array) {
      if (stopped || chunk.length === 0) return;
      const before = totalSamples;
      chunks.push(chunk);
      chunkCount += 1;
      totalSamples += chunk.length;
      const frame = gate.push(chunk);
      deps.emit({ type: "level", level: frame.level });
      if (frame.speaking && utteranceStart === null) {
        utteranceStart = Math.max(0, before - msToSamples(PRE_ROLL_MS));
        lastPartialAtMs = samplesToMs(utteranceStart);
      }
      if (frame.commit !== null && !committed) {
        committed = true;
        deps.log(
          `stream auto-commit (${frame.commit}) at ${Math.round(samplesToMs(totalSamples))} ms of audio`,
        );
        deps.emit({ type: "auto-commit", reason: frame.commit });
      }
      const due = samplesToMs(totalSamples) - lastPartialAtMs >= nextPartialGapMs();
      if (partialsEnabled && !committed && utteranceStart !== null && !inFlight && due)
        runPartial();
    },
    stop() {
      stopped = true;
      chunks.length = 0;
      deps.log(
        `stream stopped: ${Math.round(samplesToMs(totalSamples))} ms of audio in ${chunkCount} chunk(s), ${partialCount} partial(s), language ${language.locked() ?? "undetected"}`,
      );
    },
  };
}
