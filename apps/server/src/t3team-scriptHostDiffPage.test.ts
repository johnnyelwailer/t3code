import { CHANGE_REQUEST_DIFF_MAX_PAGE_SIZE } from "@t3team/sdk";
import { describe, expect, it } from "vite-plus/test";

import {
  clampDiffPageSize,
  decodeDiffCursor,
  encodeDiffCursor,
  splitPatchFiles,
  takeDiffPage,
} from "./t3team-scriptHostDiffPage.ts";

const file = (name: string, body = "+new\n") =>
  `diff --git a/${name} b/${name}\n--- a/${name}\n+++ b/${name}\n@@ -0,0 +1 @@\n${body}`;

describe("script host diff pages", () => {
  it("splits at file headers only, never inside a hunk", () => {
    const tricky = file("a.ts", "+diff --git looks like a header but is content\n");
    const files = splitPatchFiles(tricky + file("b.ts"));
    expect(files).toEqual([tricky, file("b.ts")]);
    expect(splitPatchFiles("")).toEqual([]);
  });

  it("stops before a file that would overflow the page, and cuts a lone oversized file", () => {
    const files = [file("a.ts"), file("b.ts"), file("big.ts", "+x\n".repeat(100))];
    const limit = files[0]!.length * 2 + 10;
    expect(takeDiffPage(files, 0, 10, limit)).toEqual({
      patch: files[0]! + files[1]!,
      fileCount: 2,
      truncated: false,
    });
    const lone = takeDiffPage(files, 2, 10, limit);
    expect(lone.fileCount).toBe(1);
    expect(lone.truncated).toBe(true);
    expect(lone.patch.length).toBeLessThanOrEqual(limit);
    expect(lone.patch.endsWith("\n")).toBe(true);
  });

  it("round-trips its own cursors and rejects anything else", () => {
    const position = { slice: "provider-cursor", offset: 3 };
    expect(decodeDiffCursor(encodeDiffCursor(position))).toEqual(position);
    expect(decodeDiffCursor(undefined)).toEqual({ slice: null, offset: 0 });
    expect(decodeDiffCursor("not-a-cursor")).toBeNull();
    expect(decodeDiffCursor(encodeDiffCursor({ slice: null, offset: -1 }))).toBeNull();
  });

  it("clamps page sizes into range", () => {
    expect(clampDiffPageSize(0)).toBe(1);
    expect(clampDiffPageSize(2.7)).toBe(2);
    expect(clampDiffPageSize(10_000)).toBe(CHANGE_REQUEST_DIFF_MAX_PAGE_SIZE);
  });
});
