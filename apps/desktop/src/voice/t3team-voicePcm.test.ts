import { describe, expect, it } from "vite-plus/test";

import { concatPcm16, pcm16FromBase64, pcm16Rms, pcm16ToBase64 } from "./t3team-voicePcm.ts";

describe("voice pcm helpers", () => {
  it("round-trips samples through base64", () => {
    const samples = Int16Array.from([0, 1, -1, 32767, -32768]);
    expect([...pcm16FromBase64(pcm16ToBase64(samples))]).toEqual([...samples]);
  });

  it("measures rms on a 0-1 scale", () => {
    expect(pcm16Rms(new Int16Array(0))).toBe(0);
    expect(pcm16Rms(Int16Array.from([16384, -16384]))).toBeCloseTo(0.5);
  });

  it("slices a range across chunk boundaries", () => {
    const chunks = [
      Int16Array.from([1, 2, 3]),
      Int16Array.from([4, 5]),
      Int16Array.from([6, 7, 8]),
    ];
    expect([...concatPcm16(chunks, 2, 7)]).toEqual([3, 4, 5, 6, 7]);
    expect([...concatPcm16(chunks, 0, 99)]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});
