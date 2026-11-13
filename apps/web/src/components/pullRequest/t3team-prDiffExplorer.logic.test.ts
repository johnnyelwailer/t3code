import type { FileDiffMetadata } from "@pierre/diffs";
import { describe, expect, it } from "vite-plus/test";

import {
  countViewedFiles,
  diffExplorerFileInfo,
  markAllFilesViewed,
  nextDiffExplorerFile,
  previousDiffExplorerFile,
  toggleViewedFile,
  type DiffExplorerFile,
} from "./t3team-prDiffExplorer.logic";

/** A file for the pure tree/checked/prev-next functions; `key` defaults to the path. */
function file(
  path: string,
  additions = 0,
  deletions = 0,
  oldPath: string | null = null,
): DiffExplorerFile {
  return { key: path, path, oldPath, additions, deletions };
}

/** Minimal host metadata: Pierre hands names back unprefixed, with no `cacheKey`. */
function meta(
  name: string,
  hunks: Array<{ additionLines: number; deletionLines: number }> = [],
  prevName = name,
): FileDiffMetadata {
  return { name, prevName, hunks } as unknown as FileDiffMetadata;
}

describe("diffExplorerFileInfo", () => {
  it("derives the key, the stripped path, and the summed line counts", () => {
    expect(
      diffExplorerFileInfo(meta("src/app.ts", [{ additionLines: 3, deletionLines: 2 }])),
    ).toEqual({
      key: "src/app.ts:src/app.ts",
      path: "src/app.ts",
      oldPath: null,
      additions: 3,
      deletions: 2,
    });
  });

  it("sums every hunk and keeps the old path only on a rename", () => {
    expect(
      diffExplorerFileInfo(
        meta(
          "src/new.ts",
          [
            { additionLines: 1, deletionLines: 0 },
            { additionLines: 0, deletionLines: 4 },
          ],
          "src/old.ts",
        ),
      ),
    ).toEqual({
      key: "src/old.ts:src/new.ts",
      path: "src/new.ts",
      oldPath: "src/old.ts",
      additions: 1,
      deletions: 4,
    });
  });
});

describe("viewed checkboxes", () => {
  it("toggleViewedFile adds then removes, without mutating the input", () => {
    const empty = new Set<string>();
    const one = toggleViewedFile(empty, "k1");
    expect([...one]).toEqual(["k1"]);
    const again = toggleViewedFile(one, "k1");
    expect(again.size).toBe(0);
    expect(one.size).toBe(1);
  });

  it("markAllFilesViewed covers exactly the files that are on screen", () => {
    const marked = markAllFilesViewed([file("a"), file("b")]);
    expect(countViewedFiles([file("a"), file("b"), file("c")], marked)).toEqual({
      viewed: 2,
      total: 3,
    });
  });
});

describe("prev/next navigation", () => {
  const files = [file("a"), file("b"), file("c")];

  it("steps in diff order and wraps at both ends", () => {
    expect(nextDiffExplorerFile(files, "a")?.key).toBe("b");
    expect(nextDiffExplorerFile(files, "c")?.key).toBe("a");
    expect(previousDiffExplorerFile(files, "c")?.key).toBe("b");
    expect(previousDiffExplorerFile(files, "a")?.key).toBe("c");
  });

  it("has nothing to step through when the diff is empty", () => {
    expect(nextDiffExplorerFile([], "x")).toBeNull();
    expect(previousDiffExplorerFile([], "x")).toBeNull();
  });
});
