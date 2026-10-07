import { describe, expect, it } from "vite-plus/test";

import type { T3TeamExplainerDiffBlock } from "./model/t3team-explainer";
import {
  explainerDiffStats,
  explainerHighlightSegments,
  explainerHunkHeader,
  numberExplainerDiff,
} from "./t3team-explainerDiffLines";

const block: T3TeamExplainerDiffBlock = {
  id: "d",
  type: "diff",
  path: "a.ts",
  status: "modified",
  newStart: 14,
  before: [{ kind: "context", content: "fn() {" }],
  lines: [
    { kind: "delete", content: "  await get();" },
    { kind: "add", content: "  read();" },
    { kind: "add", content: "  refresh();" },
  ],
  after: [{ kind: "context", content: "}" }],
};

describe("numberExplainerDiff", () => {
  it("numbers every line from the start line and the line kinds", () => {
    const { all, focusStart, focusEnd } = numberExplainerDiff(block);
    expect(all.map((entry) => [entry.oldLine, entry.newLine])).toEqual([
      [14, 14],
      [15, null],
      [null, 15],
      [null, 16],
      [16, 17],
    ]);
    expect([focusStart, focusEnd]).toEqual([1, 4]);
  });

  it("derives the hunk header and the counts", () => {
    expect(explainerHunkHeader(numberExplainerDiff(block).all)).toBe("@@ -14,3 +14,4 @@");
    expect(explainerDiffStats(block)).toEqual({ additions: 2, deletions: 1 });
    expect(explainerDiffStats({ ...block, stats: { additions: 9, deletions: 0 } }).additions).toBe(
      9,
    );
  });
});

describe("explainerHighlightSegments", () => {
  const marked = (text: string, words: ReadonlyArray<string>) =>
    explainerHighlightSegments(text, words)
      .filter((segment) => segment.mark)
      .map((segment) => segment.text);

  it("marks every occurrence and ignores words that are not there", () => {
    expect(marked("a.b a.b c", ["a.b", "zzz"])).toEqual(["a.b", "a.b"]);
  });

  it("resolves overlaps to the first, longer match", () => {
    expect(marked("cache.read()", ["cache", "cache.read"])).toEqual(["cache.read"]);
  });

  it("keeps the whole text", () => {
    const text = "const key = `${host}`;";
    expect(
      explainerHighlightSegments(text, ["key", "host"])
        .map((s) => s.text)
        .join(""),
    ).toBe(text);
  });
});
