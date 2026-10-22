import type {
  DesktopVoiceStreamEvent,
  DesktopVoiceStreamStopResult,
  VoiceTranscriptMetadata,
} from "@t3tools/contracts";

import { createActivityGate } from "./t3team-voiceActivityGate.ts";
import { createLanguageLock } from "./t3team-voiceLanguageLock.ts";
import { isNearSpeaker, type NearFieldGate } from "./t3team-voiceNearFieldGate.ts";
import { createPartialPacing } from "./t3team-voicePartialPacing.ts";
import { createPassChain } from "./t3team-voicePassChain.ts";
import { createStreamFinals } from "./t3team-voiceStreamFinals.ts";
import { createPcmBuffer } from "./t3team-voicePcmBuffer.ts";
import { msToSamples, pcm16ToBase64, samplesToMs } from "./t3team-voicePcm.ts";
import {
  createSpeechTracker,
  type SpeechDetect,
  type UtteranceBounds,
} from "./t3team-voiceSpeechTracker.ts";

/** A partial re-transcribes the utterance so far, capped to its most recent stretch. */
const PARTIAL_WINDOW_MS = 15_000;
/** Audio kept before Silero's first speech and after its last: word onsets and endings are soft. */
const PRE_ROLL_MS = 200;
const TRAILING_PAD_MS = 300;
/** No partial starts once the speaker has been quiet this long: the utterance is about to commit and its final must not queue behind it. */
const PARTIAL_PAUSE_MS = 400;
const CLEAR_PARTIAL = { type: "partial", text: "", elapsedMs: 0 } as const;

export type VoiceStreamTranscription =
  | {
      readonly ok: true;
      readonly text: string;
      readonly language?: string;
      readonly elapsedMs: number;
      /** The worker's own time for the pass; `elapsedMs` also counts queueing and model loading. */
      readonly passMs?: number;
      readonly metadata?: VoiceTranscriptMetadata;
    }
  | { readonly ok: false; readonly message: string };

type WithoutSession<T> = T extends unknown ? Omit<T, "sessionId"> : never;
export type VoiceStreamTranscribe = (input: {
  readonly pcm16Base64: string;
  readonly language: string;
}) => Promise<VoiceStreamTranscription>;

export type VoiceStreamEmit = (event: WithoutSession<DesktopVoiceStreamEvent>) => void;

/**
 * One recording session's live pipeline, driven by chunks (no timers). Silero
 * (`createSpeechTracker`) decides where speech starts and when the speaker paused; the energy gate
 * only meters the level and ends a forgotten session; the near-field gate drops voices far quieter
 * than the speaker. While someone speaks, partials re-transcribe the utterance so far; a pause
 * commits it through a final pass and the session keeps listening. Passes run one at a time and a
 * partial never queues behind anything, so a slow model cannot delay a final.
 */
export function createVoiceStreamSession(deps: {
  readonly configuredLanguage: string;
  readonly silenceMs: number;
  readonly transcribe: VoiceStreamTranscribe;
  /** Silero over a stretch of the session's audio; null is "unknown", which never means silence. */
  readonly detect: SpeechDetect;
  readonly emit: VoiceStreamEmit;
  readonly log: (message: string) => void;
  /** False while the model loads: partials wait for it (the next one covers the same audio). */
  readonly isWorkerReady?: () => boolean;
  /** Drops utterances far quieter than the speaker (voices across the room); none keeps all. */
  readonly nearField?: NearFieldGate;
}) {
  const pacing = createPartialPacing({
    log: deps.log,
    isWorkerReady: deps.isWorkerReady ?? (() => true),
  });
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
  const speech = createSpeechTracker({
    audio,
    detect: deps.detect,
    pauseMs: deps.silenceMs,
    onUtterance,
    log: deps.log,
  });
  let utteranceNo = 0;
  let lastPartialAtMs = Number.NEGATIVE_INFINITY;
  let stopped = false;
  let partialCount = 0;
  let chunkCount = 0;

  function runPartial() {
    const end = audio.end;
    const opened = (speech.speechStart ?? end) - msToSamples(PRE_ROLL_MS);
    const start = Math.max(opened, end - msToSamples(PARTIAL_WINDOW_MS));
    const window = audio.slice(start, end);
    lastPartialAtMs = samplesToMs(end);
    const windowMs = samplesToMs(end - start);
    const forUtterance = utteranceNo;
    if (deps.nearField?.peek(window).keep === false) return;
    void passes
      .run(() =>
        deps.transcribe({ pcm16Base64: pcm16ToBase64(window), language: language.current() }),
      )
      .then((result) => {
        if (stopped) return;
        if (!result.ok) return deps.log(`stream partial failed: ${result.message}`);
        const passMs = result.passMs ?? result.elapsedMs;
        pacing.record(passMs);
        partialCount += 1;
        if (partialCount === 1 || partialCount % 10 === 0) {
          deps.log(
            `stream partial ${partialCount}: pass ${passMs} ms, ${result.elapsedMs} ms end to end, window ${Math.round(windowMs)} ms at ${Math.round(samplesToMs(end))} ms of audio`,
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

  const isNear = (pcm: Int16Array, what: string) =>
    isNearSpeaker(deps.nearField, pcm, what, deps.log, () => deps.emit(CLEAR_PARTIAL));

  function onUtterance(bounds: UtteranceBounds) {
    utteranceNo += 1;
    pacing.resetGap();
    const pcm = utteranceAudio(bounds);
    if (!isNear(pcm, "utterance")) return;
    deps.log(
      `stream auto-commit (pause) at ${Math.round(samplesToMs(audio.end))} ms of audio, utterance ${Math.round(samplesToMs(bounds.end - bounds.start))} ms of speech ending at ${Math.round(samplesToMs(bounds.end))} ms`,
    );
    deps.emit({ type: "auto-commit", reason: "silence" });
    finals.commit(pcm);
  }

  const utteranceAudio = (bounds: UtteranceBounds) =>
    audio.slice(bounds.start - msToSamples(PRE_ROLL_MS), bounds.end + msToSamples(TRAILING_PAD_MS));

  function stop() {
    if (stopped) return;
    stopped = true;
    audio.clear();
    deps.log(
      `stream stopped: ${Math.round(samplesToMs(audio.end))} ms of audio in ${chunkCount} chunk(s), ${speech.stats()}, ${partialCount} partial(s), ${finals.committed} utterance(s), language ${language.locked() ?? "undetected"}`,
    );
  }

  return {
    push(chunk: Int16Array) {
      if (stopped || chunk.length === 0) return;
      audio.push(chunk);
      chunkCount += 1;
      const frame = gate.push(chunk);
      deps.emit({ type: "level", level: frame.level });
      const wasOpen = speech.speechStart !== null;
      speech.push(frame.speaking);
      if (!wasOpen && speech.speechStart !== null) lastPartialAtMs = samplesToMs(audio.end);
      if (frame.commit === "no-speech" || frame.commit === "idle") {
        deps.log(
          `stream auto-commit (${frame.commit}) at ${Math.round(samplesToMs(audio.end))} ms of audio`,
        );
        deps.emit({ type: "auto-commit", reason: frame.commit });
      }
      audio.trimBefore(speech.keepFrom - msToSamples(PRE_ROLL_MS));
      const due = samplesToMs(audio.end) - lastPartialAtMs >= pacing.nextGapMs();
      const paused = frame.silentMs >= PARTIAL_PAUSE_MS;
      const open = speech.speechStart !== null;
      const wanted = pacing.enabled && open && !passes.busy && due && !paused;
      if (wanted && pacing.workerReady(samplesToMs(audio.end))) runPartial();
    },
    /**
     * Ends the session without losing speech: what was said after the last committed utterance is
     * transcribed and returned, and every utterance still being written is awaited, so their
     * `utterance` events have gone out by the time this resolves.
     */
    async finish(): Promise<DesktopVoiceStreamStopResult> {
      if (stopped) return { text: "", committed: finals.committed };
      const tail = await speech.flush();
      const tailAudio = tail === null ? null : utteranceAudio(tail);
      const tailPass = tailAudio && isNear(tailAudio, "tail") ? finals.writeDown(tailAudio) : null;
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
