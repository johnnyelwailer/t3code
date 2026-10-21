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
/** A session that never heard speech ends after this long, so a forgotten recording cannot run to its limit. */
export const NO_SPEECH_TIMEOUT_MS = 8_000;
/** A session that spoke and then went quiet for this long ends, so an abandoned one does not run to its limit. */
export const SESSION_IDLE_TIMEOUT_MS = 60_000;
/** Loudness that fills the level meter. */
const LEVEL_FULL_SCALE_RMS = 0.1;

/** `silence` ends an utterance, the session goes on; `no-speech` and `idle` end the session. */
export type GateCommit = "silence" | "no-speech" | "idle";
export type GateFrame = {
  readonly level: number;
  readonly speaking: boolean;
  /** Quiet since the last speech frame; at a `silence` commit this is the silence window. */
  readonly silentMs: number;
  readonly commit: GateCommit | null;
};

/**
 * Voice activity over a stream of PCM frames, timed by the audio itself so it is deterministic.
 * `silenceMs` of quiet after real speech commits that utterance and the gate listens for the next
 * one, so one recording yields any number of utterances; 0 never commits. The only commits that
 * end the session are `no-speech` (nothing said at all) and `idle` (quiet for too long after the
 * last utterance).
 */
export function createActivityGate(options: { readonly silenceMs: number }) {
  let elapsedMs = 0;
  let noise = Number.POSITIVE_INFINITY;
  let speechMs = 0;
  let silentMs = 0;
  let quietSinceMs = 0;
  let utterances = 0;
  let ended = false;

  return {
    push(samples: Int16Array): GateFrame {
      const frameMs = samplesToMs(samples.length);
      const rms = pcm16Rms(samples);
      const calibrating = elapsedMs < CALIBRATION_MS;
      elapsedMs += frameMs;
      const level = Math.min(1, rms / LEVEL_FULL_SCALE_RMS);
      if (calibrating) {
        noise = Math.min(noise, rms);
        return { level, speaking: false, silentMs, commit: null };
      }
      const speaking = rms > Math.max(SPEECH_FLOOR_RMS, noise * SPEECH_OVER_NOISE);
      if (speaking) {
        speechMs += frameMs;
        silentMs = 0;
      } else {
        silentMs += frameMs;
        noise = Math.min(rms, noise + (rms - noise) * NOISE_DRIFT);
      }
      return { level, speaking, silentMs, commit: nextCommit() };
    },
  };

  function nextCommit(): GateCommit | null {
    if (ended || options.silenceMs <= 0) return null;
    const heardSpeech = speechMs >= MIN_SPEECH_MS;
    if (heardSpeech && silentMs >= options.silenceMs) {
      utterances += 1;
      speechMs = 0;
      quietSinceMs = elapsedMs;
      return "silence";
    }
    const quietLimit = utterances === 0 ? NO_SPEECH_TIMEOUT_MS : SESSION_IDLE_TIMEOUT_MS;
    if (!heardSpeech && elapsedMs - quietSinceMs >= quietLimit) {
      ended = true;
      return utterances === 0 ? "no-speech" : "idle";
    }
    return null;
  }
}
