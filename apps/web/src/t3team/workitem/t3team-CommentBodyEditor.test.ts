import { describe, expect, it } from "vite-plus/test";

import { spliceNewlineAtCursor } from "./t3team-CommentBodyEditor";

describe("spliceNewlineAtCursor", () => {
  it("inserts a newline at the cursor and advances the cursor by one", () => {
    expect(spliceNewlineAtCursor("alphabeta", 5)).toEqual({
      value: "alpha\nbeta",
      cursor: 6,
    });
  });

  it("inserts at the start when the cursor is at position zero", () => {
    expect(spliceNewlineAtCursor("hello", 0)).toEqual({ value: "\nhello", cursor: 1 });
  });

  it("appends when the cursor is at the end of the value", () => {
    expect(spliceNewlineAtCursor("hello", 5)).toEqual({ value: "hello\n", cursor: 6 });
  });

  it("splits an empty draft into two empty lines", () => {
    expect(spliceNewlineAtCursor("", 0)).toEqual({ value: "\n", cursor: 1 });
  });
});
