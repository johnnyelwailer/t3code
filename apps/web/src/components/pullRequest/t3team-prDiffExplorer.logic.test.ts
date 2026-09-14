import type { FileDiffMetadata } from "@pierre/diffs";
import { describe, expect, it } from "vite-plus/test";

import {
  buildDiffExplorerTree,
  compactDiffExplorerTree,
  countViewedFiles,
  diffExplorerDirectoryPaths,
  diffExplorerFileCount,
  diffExplorerFileInfo,
  markAllFilesViewed,
  nextDiffExplorerFile,
  previousDiffExplorerFile,
  toggleViewedFile,
  type DiffExplorerFile,
  type DiffExplorerNode,
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

/** Minimal host metadata: Pierre expects `a/` + `b/` prefixes and no `cacheKey`. */
function meta(
  name: string,
  hunks: Array<{ additionLines: number; deletionLines: number }> = [],
  prevName = name,
): FileDiffMetadata {
  return { name: `b/${name}`, prevName: `a/${prevName}`, hunks } as unknown as FileDiffMetadata;
}

/** A readable nested view: directories as `[name, children]`, files as their path. */
type Shape = string | [string, readonly Shape[]];
function shape(nodes: readonly DiffExplorerNode[]): Shape[] {
  return nodes.map((node) =>
    node.kind === "file" ? node.file.path : [node.name, shape(node.children)],
  );
}

describe("diffExplorerFileInfo", () => {
  it("derives the key, the stripped path, and the summed line counts", () => {
    expect(
      diffExplorerFileInfo(meta("src/app.ts", [{ additionLines: 3, deletionLines: 2 }])),
    ).toEqual({
      key: "a/src/app.ts:b/src/app.ts",
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
      key: "a/src/old.ts:b/src/new.ts",
      path: "src/new.ts",
      oldPath: "src/old.ts",
      additions: 1,
      deletions: 4,
    });
  });
});

describe("buildDiffExplorerTree", () => {
  it("groups files under their directory chain, files keeping diff order", () => {
    const tree = buildDiffExplorerTree([
      file("apps/web/a.ts"),
      file("apps/web/b.ts"),
      file("apps/server/c.ts"),
      file("README.md"),
    ]);
    expect(shape(tree)).toEqual([
      [
        "apps",
        [
          ["web", ["apps/web/a.ts", "apps/web/b.ts"]],
          ["server", ["apps/server/c.ts"]],
        ],
      ],
      "README.md",
    ]);
  });

  it("never lists a directory a second time when two files share a prefix", () => {
    const tree = buildDiffExplorerTree([file("src/a.ts"), file("src/b.ts"), file("src/deep/c.ts")]);
    expect(diffExplorerFileCount(tree)).toBe(3);
    expect(shape(tree)).toEqual([["src", ["src/a.ts", "src/b.ts", ["deep", ["src/deep/c.ts"]]]]]);
  });
});

describe("compactDiffExplorerTree", () => {
  it("merges a lone directory chain into one condensed row", () => {
    const tree = buildDiffExplorerTree([file("packages/contracts/src/lib/a.ts")]);
    expect(shape(compactDiffExplorerTree(tree))).toEqual([
      ["packages/contracts/src/lib", ["packages/contracts/src/lib/a.ts"]],
    ]);
  });

  it("keeps a directory with several children expanded", () => {
    const tree = buildDiffExplorerTree([file("apps/web/a.ts"), file("apps/server/c.ts")]);
    expect(shape(compactDiffExplorerTree(tree))).toEqual([
      [
        "apps",
        [
          ["web", ["apps/web/a.ts"]],
          ["server", ["apps/server/c.ts"]],
        ],
      ],
    ]);
  });

  it("condenses only the lone corridors around a real branch", () => {
    const tree = buildDiffExplorerTree([file("a/b/c/x.ts"), file("a/b/d/y.ts"), file("z.ts")]);
    expect(shape(compactDiffExplorerTree(tree))).toEqual([
      [
        "a/b",
        [
          ["c", ["a/b/c/x.ts"]],
          ["d", ["a/b/d/y.ts"]],
        ],
      ],
      "z.ts",
    ]);
  });
});

describe("diffExplorerFileCount", () => {
  it("counts only files, whatever the nesting", () => {
    const tree = buildDiffExplorerTree([file("a/b/1.ts"), file("a/c.ts"), file("z.ts")]);
    expect(diffExplorerFileCount(tree)).toBe(3);
    const apps = tree[0];
    expect(apps?.kind === "directory" ? diffExplorerFileCount(apps.children) : -1).toBe(2);
  });
});

describe("diffExplorerDirectoryPaths", () => {
  it("lists every directory path, ancestors before leaves", () => {
    const tree = buildDiffExplorerTree([file("a/b/1.ts"), file("z.ts")]);
    expect(diffExplorerDirectoryPaths(tree)).toEqual(["a/", "a/b/"]);
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
