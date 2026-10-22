import { DESKTOP_VOICE_SAMPLE_RATE } from "@t3tools/contracts";

export const msToSamples = (ms: number): number =>
  Math.round((ms * DESKTOP_VOICE_SAMPLE_RATE) / 1000);
export const samplesToMs = (samples: number): number =>
  (samples * 1000) / DESKTOP_VOICE_SAMPLE_RATE;

/** Copies instead of viewing: a pooled Buffer can sit at an odd offset, which Int16Array rejects. */
export function pcm16FromBase64(base64: string): Int16Array {
  const bytes = Buffer.from(base64, "base64");
  const aligned = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new Int16Array(aligned, 0, Math.floor(aligned.byteLength / 2));
}

export function pcm16ToBase64(samples: Int16Array): string {
  return Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength).toString("base64");
}

/** Root-mean-square loudness on a 0-1 scale (full-scale 16-bit PCM is 1). */
export function pcm16Rms(samples: Int16Array): number {
  if (samples.length === 0) return 0;
  let sumSquares = 0;
  for (const sample of samples) sumSquares += (sample / 0x8000) ** 2;
  return Math.sqrt(sumSquares / samples.length);
}

/** Samples `from` up to `to` (exclusive) of the chunks laid end to end; a range past the end is cut short. */
export function concatPcm16(chunks: readonly Int16Array[], from: number, to: number): Int16Array {
  const out = new Int16Array(Math.max(0, to - from));
  let cursor = 0;
  let written = 0;
  for (const chunk of chunks) {
    const chunkEnd = cursor + chunk.length;
    if (chunkEnd > from && cursor < to) {
      const slice = chunk.subarray(Math.max(0, from - cursor), Math.min(chunk.length, to - cursor));
      out.set(slice, written);
      written += slice.length;
    }
    cursor = chunkEnd;
    if (cursor >= to) break;
  }
  return out.subarray(0, written);
}
