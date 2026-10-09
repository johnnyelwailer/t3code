/** Line slicing and the caps of `fileAt`, with no provider in the way. */
import { CHANGE_REQUEST_FILE_MAX_CHARS, ChangeRequestInputError } from "@t3team/sdk";
import * as Effect from "effect/Effect";
import { describe, expect, it } from "vite-plus/test";

import { decodeText, sliceLines, validateRange } from "./t3team-scriptHostFileText.ts";

const all = { startLine: 1, endLine: Number.MAX_SAFE_INTEGER };

describe("sliceLines", () => {
  it("counts a trailing newline as the end of the last line, and keeps CRLF content", () => {
    expect(sliceLines("a\nb\n", all)).toMatchObject({ text: "a\nb", totalLines: 2, endLine: 2 });
    expect(sliceLines("a\r\nb", all)).toMatchObject({ text: "a\r\nb", totalLines: 2 });
    expect(sliceLines("\n", all)).toMatchObject({ text: "", totalLines: 1, endLine: 1 });
  });

  it("stops before a line that would pass the character cap, and says so", () => {
    const line = "x".repeat(CHANGE_REQUEST_FILE_MAX_CHARS / 2 - 1);
    const result = sliceLines([line, line, line].join("\n"), all);
    expect(result).toMatchObject({ endLine: 2, totalLines: 3, truncated: true });
  });

  it("cuts one over-long line and does not report it as whole", () => {
    const result = sliceLines("y".repeat(CHANGE_REQUEST_FILE_MAX_CHARS + 10), all);
    expect(result.text).toHaveLength(CHANGE_REQUEST_FILE_MAX_CHARS);
    expect(result).toMatchObject({ endLine: 1, totalLines: 1, truncated: true });
  });
});

describe("decodeText", () => {
  it("returns null for NUL bytes and for bytes that are not UTF-8", () => {
    expect(decodeText(new Uint8Array([104, 0, 105]))).toBeNull();
    expect(decodeText(new Uint8Array([0xff, 0xfe, 0x41]))).toBeNull();
    expect(decodeText(new TextEncoder().encode("héllo"))).toBe("héllo");
  });
});

describe("validateRange", () => {
  it("defaults to the first lines and fails a malformed range as a script input error", () => {
    expect(Effect.runSync(validateRange(undefined))).toEqual(all);
    for (const range of [
      { startLine: 3, endLine: 2 },
      { startLine: 0, endLine: 2 },
      { startLine: 1.5, endLine: 2 },
    ]) {
      expect(Effect.runSync(Effect.flip(validateRange(range)))).toBeInstanceOf(
        ChangeRequestInputError,
      );
    }
  });
});
