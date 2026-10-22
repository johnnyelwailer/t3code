import { msToSamples } from "./t3team-voicePcm.ts";

/** A deterministic square wave at `amplitude` of full scale; 0 is digital silence. */
export function tone(ms: number, amplitude: number): Int16Array {
  const samples = new Int16Array(msToSamples(ms));
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = (index % 2 === 0 ? 1 : -1) * Math.round(amplitude * 0x7fff);
  }
  return samples;
}

export const FRAME_MS = 100;
export const ROOM = 0.004;
export const SPEECH = 0.1;

/** Above this RMS a 100 ms frame counts as speech for `fakeSilero`; ROOM is below, SPEECH above. */
const FAKE_SPEECH_RMS = 0.03;

/**
 * A deterministic stand-in for Silero in tests: 100 ms frames louder than `FAKE_SPEECH_RMS` are
 * speech, merged into spans in ms. Answers synchronously so tests can feed audio without awaiting.
 */
export function fakeSilero(pcm: Int16Array): Array<{ startMs: number; endMs: number }> {
  const frame = msToSamples(FRAME_MS);
  const spans: Array<{ startMs: number; endMs: number }> = [];
  for (let at = 0; at < pcm.length; at += frame) {
    const chunk = pcm.subarray(at, Math.min(pcm.length, at + frame));
    let sum = 0;
    for (const sample of chunk) sum += (sample / 0x8000) ** 2;
    if (Math.sqrt(sum / chunk.length) <= FAKE_SPEECH_RMS) continue;
    const startMs = (at / frame) * FRAME_MS;
    const endMs = startMs + (chunk.length / frame) * FRAME_MS;
    const last = spans.at(-1);
    if (last !== undefined && last.endMs === startMs) last.endMs = endMs;
    else spans.push({ startMs, endMs });
  }
  return spans;
}
