import { describe, expect, it } from "vite-plus/test";

import {
  applyDiffSlicePage,
  isSameDiffSlice,
  type DiffSlice,
} from "./t3team-pullRequestDiffSlices.logic";

const firstPage = (patch: string, nextCursor = "page-2"): DiffSlice => ({
  cursor: null,
  patch,
  truncated: false,
  nextCursor,
  omittedFileStats: [],
});

const secondPage = (patch: string): DiffSlice => ({
  cursor: "page-2",
  patch,
  truncated: false,
  nextCursor: null,
  omittedFileStats: [],
});

describe("applyDiffSlicePage", () => {
  it("keeps the held slices untouched when a refresh returns the same first page", () => {
    // The reader has paged into a second slice and is parked on a file inside it.
    const held = [firstPage("patch-a"), secondPage("patch-b")];
    // An agent turn bumps the refresh token; the tab re-reads the first page and it comes back
    // byte-for-byte the same. The fold must hand back the very array it was given so the caller
    // leaves the slice state (and the focused file, which lives inside these slices) alone.
    expect(applyDiffSlicePage(held, null, firstPage("patch-a"))).toBe(held);
  });

  it("replaces from the moved page when the first page actually changed", () => {
    const held = [firstPage("patch-a"), secondPage("patch-b")];
    const next = applyDiffSlicePage(held, null, firstPage("patch-a'"));
    // A new array, the first slice swapped, and the stale second slice dropped with it: its
    // cursor was a position in the diff the host re-sliced.
    expect(next).not.toBe(held);
    expect(next).toHaveLength(1);
    expect(next).toEqual([firstPage("patch-a'")]);
  });

  it("appends a page whose cursor is not yet loaded", () => {
    const held = [firstPage("patch-a")];
    const next = applyDiffSlicePage(held, "page-2", secondPage("patch-b"));
    expect(next).not.toBe(held);
    expect(next).toHaveLength(2);
    expect(next).toEqual([firstPage("patch-a"), secondPage("patch-b")]);
  });

  it("compares omitted file stats, not just the patch", () => {
    const base = { cursor: null, patch: "p", truncated: false, nextCursor: null };
    const withStat = (stats: DiffSlice["omittedFileStats"]): DiffSlice => ({
      ...base,
      omittedFileStats: stats,
    });
    expect(
      isSameDiffSlice(
        withStat([{ path: "a.ts", additions: 1, deletions: 0 }]),
        withStat([{ path: "a.ts", additions: 1, deletions: 0 }]),
      ),
    ).toBe(true);
    expect(
      isSameDiffSlice(
        withStat([{ path: "a.ts", additions: 1, deletions: 0 }]),
        withStat([{ path: "a.ts", additions: 2, deletions: 0 }]),
      ),
    ).toBe(false);
  });
});
