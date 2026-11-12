/**
 * Silero answers "is this speech", not "is this the person at the microphone": voices across the
 * room are speech too (measured on Phil's mic: 0.018-0.046 span level with AGC off, against 0.07-0.25
 * once Chrome's AGC lifted them). What tells them apart is level: the speaker is near the mic. So
 * an utterance is judged against the speaker's own recent level, never a fixed number that would
 * have to be guessed per microphone: it is dropped only when it is far quieter (ratio, -10.5 dB)
 * than the median of the session's last utterances kept. Until the speaker has been heard there is
 * no reference and everything is kept. The reference lives in one session only: a bench across
 * sessions showed a loud speaker's level shutting out the next, quieter session (another mic, or
 * leaning back), so each recording learns its speaker afresh.
 */
const FRAME_SAMPLES = 480;
const LEVEL_PERCENTILE = 0.9;
const KEEP_RATIO = 0.3;
const HISTORY = 5;

/** An utterance's level: the 90th percentile of its 30 ms frames' RMS, so pauses inside do not count. */
export function speechLevel(pcm: Int16Array): number {
  const frames: number[] = [];
  for (let start = 0; start + FRAME_SAMPLES <= pcm.length; start += FRAME_SAMPLES) {
    let sum = 0;
    for (let i = start; i < start + FRAME_SAMPLES; i++) {
      const value = (pcm[i] ?? 0) / 32768;
      sum += value * value;
    }
    frames.push(Math.sqrt(sum / FRAME_SAMPLES));
  }
  if (frames.length === 0) return 0;
  frames.sort((a, b) => a - b);
  return frames[Math.min(frames.length - 1, Math.floor(frames.length * LEVEL_PERCENTILE))] ?? 0;
}

export type NearFieldVerdict = {
  readonly keep: boolean;
  readonly level: number;
  /** The speaker's reference level it was judged against; null before the speaker was heard. */
  readonly reference: number | null;
};

export type NearFieldGate = {
  /** Judges a final utterance and, when kept, learns the speaker's level from it. */
  readonly judge: (pcm: Int16Array) => NearFieldVerdict;
  /** The same verdict for a partial window, without learning from it. */
  readonly peek: (pcm: Int16Array) => NearFieldVerdict;
};

/** One per recording session. */
export function createNearFieldGate(): NearFieldGate {
  let kept: readonly number[] = [];

  const reference = (): number | null => {
    if (kept.length === 0) return null;
    const levels = kept.toSorted((a, b) => a - b);
    return levels[Math.floor(levels.length / 2)] ?? null;
  };

  const verdict = (pcm: Int16Array): NearFieldVerdict => {
    const level = speechLevel(pcm);
    const ref = reference();
    return { keep: ref === null || level >= ref * KEEP_RATIO, level, reference: ref };
  };

  return {
    judge: (pcm) => {
      const result = verdict(pcm);
      if (result.keep && result.level > 0) {
        kept = [...kept, result.level].slice(-HISTORY);
      }
      return result;
    },
    peek: verdict,
  };
}

/** For the log: levels only, never audio or text. */
const describeVerdict = (verdict: NearFieldVerdict): string =>
  `level ${verdict.level.toFixed(3)} under ${KEEP_RATIO} x speaker ${verdict.reference?.toFixed(3) ?? "unknown"}`;

/** Whether to write an utterance down; a far one is logged (levels only) and `dropped` runs. */
export function isNearSpeaker(
  gate: NearFieldGate | undefined,
  pcm: Int16Array,
  what: string,
  log: (message: string) => void,
  dropped: () => void,
): boolean {
  const verdict = gate?.judge(pcm);
  if (verdict === undefined || verdict.keep) return true;
  log(`stream dropped ${what} as background: ${describeVerdict(verdict)}`);
  dropped();
  return false;
}
