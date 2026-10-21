import type { DesktopVoiceStreamEvent, DesktopVoiceStreamStopResult } from "@t3tools/contracts";

import { createActivityGate, SPEECH_FLOOR_RMS } from "./t3team-voiceActivityGate.ts";
import { createLanguageLock } from "./t3team-voiceLanguageLock.ts";
import { createPassChain } from "./t3team-voicePassChain.ts";
import { createStreamFinals } from "./t3team-voiceStreamFinals.ts";
import { createPcmBuffer } from "./t3team-voicePcmBuffer.ts";
import { msToSamples, pcm16Rms, pcm16ToBase64, samplesToMs } from "./t3team-voicePcm.ts";

/** Partials come at most this often; a slow transcription stretches the gap (see `nextPartialGapMs`). */
const PARTIAL_INTERVAL_MS = 2_000;
/** A partial re-transcribes the utterance so far, capped to its most recent stretch. */
const PARTIAL_WINDOW_MS = 15_000;
const PRE_ROLL_MS = 300;
/** Silence kept after the last word when an utterance is cut for its final pass. */
const TRAILING_PAD_MS = 400;
/** No partial starts once the speaker has been quiet this long: the utterance is about to commit and its final must not queue behind it. */
const PARTIAL_PAUSE_MS = 400;
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
export type VoiceStreamTranscribe = (input: {
  readonly pcm16Base64: string;
  readonly language: string;
}) => Promise<VoiceStreamTranscription>;

export type VoiceStreamEmit = (event: WithoutSession<DesktopVoiceStreamEvent>) => void;

/**
 * One recording session's live pipeline. A hotkey press opens it and the next press closes it; in
 * between it hears any number of utterances. Chunks drive everything, so it needs no timers: the
 * activity gate reports levels and decides when the speaker paused, and while someone is speaking
 * a partial pass re-transcribes the utterance so far. A pause commits the utterance: its audio is
 * written down by a final pass, the text goes out as an `utterance` event, and the session keeps
 * listening. The language lock belongs to the session, so later utterances reuse it. Passes run
 * one at a time and a partial never queues behind anything, so a slow model cannot delay a final.
 */
export function createVoiceStreamSession(deps: {
  readonly configuredLanguage: string;
  readonly silenceMs: number;
  readonly transcribe: VoiceStreamTranscribe;
  readonly emit: VoiceStreamEmit;
  readonly log: (message: string) => void;
}) {
  const gate = createActivityGate({ silenceMs: deps.silenceMs });
  const language = createLanguageLock(deps.configuredLanguage);
  const audio = createPcmBuffer();
  const passes = createPassChain();
  const finals = createStreamFinals({
    passes,
    language,
    transcribe: deps.transcribe,
    emit: deps.emit,
    log: deps.log,
    isStopped: () => stopped,
  });
  let utteranceStart: number | null = null;
  let utteranceNo = 0;
  let lastPartialAtMs = Number.NEGATIVE_INFINITY;
  let lastPartialElapsedMs = 0;
  let stopped = false;
  let partialsEnabled = true;
  let partialCount = 0;
  let chunkCount = 0;

  const nextPartialGapMs = () => Math.max(PARTIAL_INTERVAL_MS, lastPartialElapsedMs);

  function runPartial() {
    const end = audio.end;
    const start = Math.max(utteranceStart ?? 0, end - msToSamples(PARTIAL_WINDOW_MS));
    const window = audio.slice(start, end);
    if (pcm16Rms(window) < SPEECH_FLOOR_RMS) return;
    lastPartialAtMs = samplesToMs(end);
    const windowMs = samplesToMs(end - start);
    const forUtterance = utteranceNo;
    void passes
      .run(() =>
        deps.transcribe({ pcm16Base64: pcm16ToBase64(window), language: language.current() }),
      )
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
        if (result.text.trim() === "") return;
        if (forUtterance === utteranceNo) {
          deps.emit({ type: "partial", text: result.text, elapsedMs: result.elapsedMs });
        }
        finals.voteLanguage(result, windowMs);
      })
      .catch((error: unknown) => deps.log(`stream partial failed: ${String(error)}`));
  }

  function onSilence(silentMs: number) {
    const start = utteranceStart;
    utteranceStart = null;
    utteranceNo += 1;
    lastPartialElapsedMs = 0;
    if (start === null) return;
    const speechEnd = audio.end - msToSamples(Math.max(0, silentMs - TRAILING_PAD_MS));
    deps.log(
      `stream auto-commit (silence) at ${Math.round(samplesToMs(audio.end))} ms of audio, utterance ${Math.round(samplesToMs(speechEnd - start))} ms`,
    );
    deps.emit({ type: "auto-commit", reason: "silence" });
    finals.commit(audio.slice(start, speechEnd));
    audio.trimBefore(audio.end - msToSamples(PRE_ROLL_MS));
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    audio.clear();
    deps.log(
      `stream stopped: ${Math.round(samplesToMs(audio.end))} ms of audio in ${chunkCount} chunk(s), ${partialCount} partial(s), ${finals.committed} utterance(s), language ${language.locked() ?? "undetected"}`,
    );
  }

  return {
    push(chunk: Int16Array) {
      if (stopped || chunk.length === 0) return;
      const before = audio.end;
      audio.push(chunk);
      chunkCount += 1;
      const frame = gate.push(chunk);
      deps.emit({ type: "level", level: frame.level });
      if (frame.speaking && utteranceStart === null) {
        utteranceStart = Math.max(0, before - msToSamples(PRE_ROLL_MS));
        lastPartialAtMs = samplesToMs(utteranceStart);
      }
      if (frame.commit === "silence") onSilence(frame.silentMs);
      else if (frame.commit !== null) {
        deps.log(
          `stream auto-commit (${frame.commit}) at ${Math.round(samplesToMs(audio.end))} ms of audio`,
        );
        deps.emit({ type: "auto-commit", reason: frame.commit });
      }
      const due = samplesToMs(audio.end) - lastPartialAtMs >= nextPartialGapMs();
      const paused = frame.silentMs >= PARTIAL_PAUSE_MS;
      if (partialsEnabled && utteranceStart !== null && !passes.busy && due && !paused) {
        runPartial();
      }
    },
    /**
     * Ends the session without losing speech: what was said after the last committed utterance is
     * transcribed and returned, and every utterance still being written is awaited, so their
     * `utterance` events have gone out by the time this resolves.
     */
    async finish(): Promise<DesktopVoiceStreamStopResult> {
      if (stopped) return { text: "", committed: finals.committed };
      const start = utteranceStart;
      utteranceStart = null;
      const tail = start === null ? null : audio.slice(start, audio.end);
      const tailPass =
        tail !== null && pcm16Rms(tail) >= SPEECH_FLOOR_RMS ? finals.writeDown(tail) : null;
      await passes.idle();
      await finals.settled();
      const result =
        tailPass === null
          ? null
          : await tailPass.catch((error: unknown) => ({
              ok: false as const,
              message: String(error),
            }));
      stop();
      if (result === null) return { text: "", committed: finals.committed };
      return result.ok
        ? { text: result.text, committed: finals.committed }
        : { text: "", committed: finals.committed, error: result.message };
    },
    stop,
  };
}
