import { describe, expect, it } from "vite-plus/test";
import { prTreeReviewIndex } from "./t3team-prTreeReviewIndex";
import {
  diffExplorerViewedState,
  toggleDirectoryViewedKeys,
} from "./t3team-prDiffExplorer.directoryViewed";
const file = (path: string) => ({ key: path, path, oldPath: null, additions: 1, deletions: 0 });
describe("PR tree review index", () => {
  it("keeps file/directory collisions distinct and indexes compacted folder ancestors", () => {
    const root = file("src"),
      nested = file("src/deep/a.ts"),
      sibling = file("src-other/b.ts");
    const index = prTreeReviewIndex([root, nested, sibling]);
    expect(index.byPath.get("src")).toBe(root);
    expect(index.directories.get("src/")).toEqual([nested]);
    expect(index.directories.get("src/deep/")).toEqual([nested]);
    expect(index.directories.get("src-other/")).toEqual([sibling]);
  });
  it("shows partial selection and toggles the whole folder without touching siblings", () => {
    const keys = ["a", "b"];
    const viewed = new Set(["a", "other"]);
    expect(diffExplorerViewedState(keys, viewed)).toBe("partial");
    const all = toggleDirectoryViewedKeys(viewed, keys);
    expect(diffExplorerViewedState(keys, all)).toBe("all");
    expect(toggleDirectoryViewedKeys(all, keys)).toEqual(new Set(["other"]));
    expect(diffExplorerViewedState([], all)).toBe("none");
  });
});
