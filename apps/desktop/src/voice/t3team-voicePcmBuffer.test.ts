import { describe, expect, it } from "vite-plus/test";

import { createPcmBuffer } from "./t3team-voicePcmBuffer.ts";

const chunk = (start: number, length: number) =>
  Int16Array.from({ length }, (_, index) => start + index);

function filled() {
  const buffer = createPcmBuffer();
  buffer.push(chunk(0, 4));
  buffer.push(chunk(4, 4));
  buffer.push(chunk(8, 4));
  return buffer;
}

describe("createPcmBuffer", () => {
  it("addresses samples by absolute position across chunk boundaries", () => {
    const buffer = filled();
    expect(buffer.end).toBe(12);
    expect(Array.from(buffer.slice(2, 10))).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
    expect(Array.from(buffer.slice(0, 100))).toHaveLength(12);
  });

  it("keeps positions stable after audio nobody needs is trimmed", () => {
    const buffer = filled();
    buffer.trimBefore(6);
    expect(buffer.end).toBe(12);
    expect(Array.from(buffer.slice(4, 10))).toEqual([4, 5, 6, 7, 8, 9]);
    buffer.push(chunk(12, 4));
    expect(Array.from(buffer.slice(9, 14))).toEqual([9, 10, 11, 12, 13]);
  });

  it("cuts a range short instead of inventing audio that was trimmed or never arrived", () => {
    const buffer = filled();
    buffer.trimBefore(8);
    expect(Array.from(buffer.slice(0, 10))).toEqual([8, 9]);
    expect(Array.from(buffer.slice(10, 40))).toEqual([10, 11]);
  });

  it("forgets everything on clear but keeps counting from where it was", () => {
    const buffer = filled();
    buffer.clear();
    expect(buffer.slice(0, 12)).toHaveLength(0);
    buffer.push(chunk(100, 2));
    expect(buffer.end).toBe(14);
    expect(Array.from(buffer.slice(12, 14))).toEqual([100, 101]);
  });
});
