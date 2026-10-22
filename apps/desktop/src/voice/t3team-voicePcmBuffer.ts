/**
 * The audio of one recording session, addressed by absolute sample position. A session lasts up to
 * minutes, so audio that no utterance can still need is dropped with `trimBefore` while positions
 * keep counting from the start of the recording.
 */
export function createPcmBuffer() {
  let chunks: Int16Array[] = [];
  let firstSample = 0;
  let endSample = 0;

  return {
    get end(): number {
      return endSample;
    },
    push(chunk: Int16Array): void {
      chunks.push(chunk);
      endSample += chunk.length;
    },
    /** Samples `from` up to `to`, both absolute; a range outside what is held is cut short. */
    slice(from: number, to: number): Int16Array {
      const start = Math.max(from, firstSample);
      const out = new Int16Array(Math.max(0, Math.min(to, endSample) - start));
      let cursor = firstSample;
      let written = 0;
      for (const chunk of chunks) {
        const chunkEnd = cursor + chunk.length;
        if (chunkEnd > start && cursor < to) {
          const piece = chunk.subarray(
            Math.max(0, start - cursor),
            Math.min(chunk.length, to - cursor),
          );
          out.set(piece, written);
          written += piece.length;
        }
        cursor = chunkEnd;
        if (cursor >= to) break;
      }
      return out.subarray(0, written);
    },
    /** Forgets whole chunks that end at or before `sample`. */
    trimBefore(sample: number): void {
      let dropped = 0;
      let cursor = firstSample;
      for (const chunk of chunks) {
        if (cursor + chunk.length > sample) break;
        cursor += chunk.length;
        dropped += 1;
      }
      chunks = chunks.slice(dropped);
      firstSample = cursor;
    },
    clear(): void {
      chunks = [];
      firstSample = endSample;
    },
  };
}

export type PcmBuffer = ReturnType<typeof createPcmBuffer>;
