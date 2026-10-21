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
