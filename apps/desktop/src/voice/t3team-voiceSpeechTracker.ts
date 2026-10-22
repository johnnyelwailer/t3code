import type { SpeechSpan } from "./t3team-whisperProtocol.ts";
import type { PcmBuffer } from "./t3team-voicePcmBuffer.ts";
import { msToSamples, samplesToMs } from "./t3team-voicePcm.ts";

/** How often Silero looks at the newest audio; two tap chunks. */
const VAD_STEP_MS = 256;
/** Audio Silero re-reads before the newest step, so a word cut by the last look is seen whole. */
const VAD_LOOKBACK_MS = 1_000;
/** A span reaching this close to the end of the audio means the speaker is still talking. */
const STILL_SPEAKING_MS = 60;
/** Whisper hears at most 30 s; an utterance this long is cut at its last pause. */
const MAX_UTTERANCE_MS = 28_000;

/**
 * Silero's spans; null when it could not answer ("unknown"); "pending" while the model is still
 * loading, so the audio waits for it instead of being judged by energy.
 */
type SpeechAnswer = readonly SpeechSpan[] | null | "pending";
/** Usually async; an answer given synchronously is applied at once (tests rely on it). */
export type SpeechDetect = (pcm: Int16Array) => Promise<SpeechAnswer> | SpeechAnswer;

/** One utterance, in absolute samples: from where speech began to where it last ended. */
export type UtteranceBounds = { readonly start: number; readonly end: number };

/**
 * Speech-gated segmentation. Silero decides where speech is; the energy gate is only the fallback
 * for a look VAD could not answer (no model, an error, a timeout): unknown is treated as speech
 * when the room was loud, never as silence. Audio Silero hears no speech in never opens an
 * utterance, so it never reaches whisper. A pause is `pauseMs` since Silero last heard speech
 * (0: never commit on a pause). Looks run one at a time; a slow one only delays the next.
 */
export function createSpeechTracker(deps: {
  readonly audio: PcmBuffer;
  readonly detect: SpeechDetect;
  readonly pauseMs: number;
  readonly onUtterance: (bounds: UtteranceBounds) => void;
  readonly log: (message: string) => void;
}) {
  let speechStart: number | null = null;
  let speechEnd = 0;
  let checkedTo = 0;
  let committedTo = 0;
  let energySinceLook = false;
  let looking: Promise<void> | null = null;
  let lastLookAt = 0;
  const stats = { looks: 0, unknown: 0, speechMs: 0 };

  function apply(from: number, to: number, answer: SpeechAnswer) {
    const backlogFull = to - checkedTo >= msToSamples(MAX_UTTERANCE_MS);
    if (answer === "pending" && !backlogFull) return;
    const spans = answer === "pending" ? null : answer;
    stats.looks += 1;
    let heard: { start: number; end: number } | null = null;
    if (spans === null) {
      stats.unknown += 1;
      if (stats.unknown === 1) deps.log("stream vad unknown: the energy gate stands in for it");
      if (energySinceLook) heard = { start: Math.max(from, checkedTo), end: to };
    } else {
      for (const span of spans) {
        const start = from + msToSamples(span.startMs);
        const end = Math.min(to, from + msToSamples(span.endMs));
        if (end <= Math.max(committedTo, speechEnd)) continue;
        heard = heard === null ? { start, end } : { start: heard.start, end };
      }
      if (heard !== null && to - heard.end <= msToSamples(STILL_SPEAKING_MS)) heard.end = to;
    }
    energySinceLook = false;
    checkedTo = to;
    if (heard !== null) {
      stats.speechMs += samplesToMs(heard.end - Math.max(heard.start, speechEnd));
      speechStart ??= Math.max(heard.start, committedTo);
      speechEnd = Math.max(speechEnd, heard.end);
    }
    if (speechStart === null) return;
    const paused = deps.pauseMs > 0 && to - speechEnd >= msToSamples(deps.pauseMs);
    const tooLong = to - speechStart >= msToSamples(MAX_UTTERANCE_MS);
    if (paused || tooLong) commit(tooLong && !paused ? to : speechEnd);
  }

  function commit(end: number) {
    const start = speechStart;
    if (start === null) return;
    speechStart = null;
    committedTo = end;
    speechEnd = end;
    deps.onUtterance({ start, end });
  }

  function look(final = false): Promise<void> {
    const to = deps.audio.end;
    const from = Math.max(committedTo, checkedTo - msToSamples(VAD_LOOKBACK_MS), 0);
    if (from >= to) return Promise.resolve();
    const pcm = deps.audio.slice(from, to);
    const settle = (answer: SpeechAnswer) =>
      apply(to - pcm.length, to, final && answer === "pending" ? null : answer);
    let answer: Promise<SpeechAnswer> | SpeechAnswer;
    try {
      answer = deps.detect(pcm);
    } catch {
      answer = null;
    }
    if (!(answer instanceof Promise)) {
      settle(answer);
      return Promise.resolve();
    }
    const run = answer
      .catch(() => null)
      .then(settle)
      .finally(() => (looking = null));
    looking = run;
    return run;
  }

  return {
    /** Called per chunk; `energySpeaking` is the energy gate's frame verdict. */
    push(energySpeaking: boolean): void {
      energySinceLook ||= energySpeaking;
      const due = deps.audio.end - Math.max(checkedTo, lastLookAt) >= msToSamples(VAD_STEP_MS);
      if (looking === null && due) {
        lastLookAt = deps.audio.end;
        void look();
      }
    },
    /** Where the open utterance began, in absolute samples; null while nobody is speaking. */
    get speechStart(): number | null {
      return speechStart;
    },
    /** Audio before this can be forgotten: nothing open needs it. */
    get keepFrom(): number {
      return speechStart ?? Math.max(committedTo, checkedTo - msToSamples(VAD_LOOKBACK_MS));
    },
    /** Looks at what is left and returns the open utterance, if any, without committing it. */
    async flush(): Promise<UtteranceBounds | null> {
      await looking;
      if (deps.audio.end > checkedTo) await look(true);
      const start = speechStart;
      speechStart = null;
      return start === null ? null : { start, end: deps.audio.end };
    },
    stats: (): string =>
      `vad ${stats.looks} look(s), ${stats.unknown} unknown, ${Math.round(stats.speechMs)} ms speech`,
  };
}
