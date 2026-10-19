import { describe, expect, it } from "vite-plus/test";

import { floatToPcm16Base64 } from "./t3team-recordingToPcm";

function decode(base64: string): number[] {
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  const view = new DataView(bytes.buffer);
  return Array.from({ length: bytes.length / 2 }, (_, index) => view.getInt16(index * 2, true));
}

describe("floatToPcm16Base64", () => {
  it("encodes little-endian signed 16-bit samples and clamps out-of-range input", () => {
    expect(decode(floatToPcm16Base64(Float32Array.of(0, 1, -1, 0.5, 2, -2)))).toEqual([
      0, 32767, -32768, 16383, 32767, -32768,
    ]);
  });

  it("handles recordings larger than one base64 chunk", () => {
    const samples = new Float32Array(50_000).fill(0.25);
    const decoded = decode(floatToPcm16Base64(samples));
    expect(decoded).toHaveLength(50_000);
    expect(decoded.every((sample) => sample === 8191)).toBe(true);
  });
});
