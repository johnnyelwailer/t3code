import { pcm16Rms, samplesToMs } from "./t3team-voicePcm.ts";

/**
 * Energy gate ported from nx-activity-tracker's `AudioChunkGate`: below this RMS a chunk is
 * silence, never speech. The tracker found near-silent chunks to be the trigger for whisper
 * hallucination loops and language drift.
 */
export const SPEECH_FLOOR_RMS = 0.0025;
/** A frame is speech when it is this many times louder than the measured room tone. */
const SPEECH_OVER_NOISE = 3;
/** Room tone is measured from the quietest frame of this opening window. */
const CALIBRATION_MS = 500;
const NOISE_DRIFT = 0.01;
const MIN_SPEECH_MS = 300;
/** Commit an empty recording after this long, so a forgotten recording cannot run to its limit. */
export const NO_SPEECH_TIMEOUT_MS = 8_000;
/** Loudness that fills the level meter. */
const LEVEL_FULL_SCALE_RMS = 0.1;

export type GateCommit = "silence" | "no-speech";
export type GateFrame = {
  readonly level: number;
  readonly speaking: boolean;
  readonly commit: GateCommit | null;
};

/**
 * Voice activity over a stream of PCM frames, timed by the audio itself so it is deterministic.
 * `silenceMs` of quiet after real speech commits the recording; 0 never commits.
 */
export function createActivityGate(options: { readonly silenceMs: number }) {
  let elapsedMs = 0;
  let noise = Number.POSITIVE_INFINITY;
  let speechMs = 0;
  let silentMs = 0;
  let committed = false;

  return {
    push(samples: Int16Array): GateFrame {
      const frameMs = samplesToMs(samples.length);
      const rms = pcm16Rms(samples);
      const calibrating = elapsedMs < CALIBRATION_MS;
      elapsedMs += frameMs;
      const level = Math.min(1, rms / LEVEL_FULL_SCALE_RMS);
      if (calibrating) {
        noise = Math.min(noise, rms);
        return { level, speaking: false, commit: null };
      }
      const speaking = rms > Math.max(SPEECH_FLOOR_RMS, noise * SPEECH_OVER_NOISE);
      if (speaking) {
        speechMs += frameMs;
        silentMs = 0;
      } else {
        silentMs += frameMs;
        noise = Math.min(rms, noise + (rms - noise) * NOISE_DRIFT);
      }
      return { level, speaking, commit: nextCommit() };
    },
  };

  function nextCommit(): GateCommit | null {
    if (committed || options.silenceMs <= 0) return null;
    const heardSpeech = speechMs >= MIN_SPEECH_MS;
    const reason: GateCommit | null =
      heardSpeech && silentMs >= options.silenceMs
        ? "silence"
        : !heardSpeech && elapsedMs >= NO_SPEECH_TIMEOUT_MS
          ? "no-speech"
          : null;
    committed = reason !== null;
    return reason;
  }
}
