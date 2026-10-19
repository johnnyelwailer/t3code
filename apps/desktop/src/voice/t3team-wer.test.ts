import { describe, expect, it } from "vite-plus/test";

import { computeWer } from "./t3team-wer.ts";

describe("computeWer", () => {
  it("ignores case and punctuation", () => {
    expect(
      computeWer("Ask not what your country can do.", "ask not what your country can do"),
    ).toBe(0);
  });

  it("counts substitutions, insertions and deletions against the reference length", () => {
    expect(computeWer("a b c d", "a x c d")).toBe(0.25);
    expect(computeWer("a b c d", "a b c d e")).toBe(0.25);
    expect(computeWer("a b c d", "a b")).toBe(0.5);
  });

  it("handles empty sides", () => {
    expect(computeWer("", "")).toBe(0);
    expect(computeWer("hello", "")).toBe(1);
  });
});
