import { describe, expect, it } from "vite-plus/test";

import { diffExplorerPressChanges } from "./t3team-prDiffExplorer.directoryViewed";
import { countViewedFiles, type DiffExplorerFile } from "./t3team-prDiffExplorer.logic";
import { stepOpenClear } from "./t3team-prDiffExplorer.openClear";
import {
  isFileTicked,
  isFileViewed,
  toFileViewedStates,
  type FileViewedOverlay,
} from "./pullRequestFilesViewed.logic";

const NO_OVERLAY: FileViewedOverlay = new Map();

const states = toFileViewedStates({
  files: [
    { path: "a.ts", state: "viewed" },
    { path: "b.ts", state: "unviewed" },
    { path: "c.ts", state: "dismissed" },
  ],
  truncated: false,
});

function file(path: string): DiffExplorerFile {
  return { key: `key:${path}`, path, oldPath: null, additions: 1, deletions: 0 };
}

const files = ["a.ts", "b.ts", "c.ts"].map(file);

describe("isFileTicked", () => {
  it("keeps the tick of a file pushed to since it was viewed, without calling it viewed", () => {
    expect(isFileTicked("c.ts", states, NO_OVERLAY)).toBe(true);
    expect(isFileViewed("c.ts", states, NO_OVERLAY)).toBe(false);
  });

  it("ticks what the host calls viewed and leaves the rest empty", () => {
    expect(isFileTicked("a.ts", states, NO_OVERLAY)).toBe(true);
    expect(isFileTicked("b.ts", states, NO_OVERLAY)).toBe(false);
    expect(isFileTicked("z.ts", null, NO_OVERLAY)).toBe(false);
  });

  it("shows the press ahead of the host, including un-ticking a changed file", () => {
    expect(isFileTicked("c.ts", states, new Map([["c.ts", false]]))).toBe(false);
    expect(isFileTicked("b.ts", states, new Map([["b.ts", true]]))).toBe(true);
  });
});

describe("countViewedFiles with changed files", () => {
  const ticked = new Set(
    files.filter((f) => isFileTicked(f.path, states, NO_OVERLAY)).map((f) => f.key),
  );

  it("counts a ticked file that changed since as not yet viewed", () => {
    expect(countViewedFiles(files, ticked, new Set([file("c.ts").key]))).toEqual({
      viewed: 1,
      total: 3,
    });
  });

  it("counts every tick when nothing changed", () => {
    expect(countViewedFiles(files, ticked)).toEqual({ viewed: 2, total: 3 });
  });
});

describe("diffExplorerPressChanges", () => {
  const state = {
    isViewed: (path: string) => isFileViewed(path, states, NO_OVERLAY),
    isTicked: (path: string) => isFileTicked(path, states, NO_OVERLAY),
  };

  it("viewing re-marks a changed file and skips the ones already fully viewed", () => {
    expect(diffExplorerPressChanges(files, true, state).map((f) => f.path)).toEqual([
      "b.ts",
      "c.ts",
    ]);
  });

  it("clearing takes every ticked file, changed ones included", () => {
    expect(diffExplorerPressChanges(files, false, state).map((f) => f.path)).toEqual([
      "a.ts",
      "c.ts",
    ]);
  });
});

describe("stepOpenClear", () => {
  it("clears a changed file the first time it is opened", () => {
    expect(stepOpenClear(null, "pr\nc.ts", true, true)).toEqual({
      handled: "pr\nc.ts",
      clear: true,
    });
  });

  it("clears once: the same opening does not clear again", () => {
    expect(stepOpenClear("pr\nc.ts", "pr\nc.ts", true, true).clear).toBe(false);
  });

  it("leaves a file that changed under the reader while it was open until they come back", () => {
    const opened = stepOpenClear(null, "pr\nc.ts", true, false);
    expect(opened).toEqual({ handled: "pr\nc.ts", clear: false });
    expect(stepOpenClear(opened.handled, "pr\nc.ts", true, true).clear).toBe(false);
  });

  it("waits for the host's answer instead of spending the opening on a guess", () => {
    const early = stepOpenClear(null, "pr\nc.ts", false, false);
    expect(early).toEqual({ handled: null, clear: false });
    expect(stepOpenClear(early.handled, "pr\nc.ts", true, true).clear).toBe(true);
  });

  it("opens again after the reader left and came back", () => {
    const left = stepOpenClear("pr\nc.ts", "pr\nb.ts", true, false);
    expect(stepOpenClear(left.handled, "pr\nc.ts", true, true).clear).toBe(true);
    expect(stepOpenClear("pr\nc.ts", null, true, false).handled).toBeNull();
  });
});
