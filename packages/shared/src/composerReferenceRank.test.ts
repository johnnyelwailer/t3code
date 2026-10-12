import { describe, expect, it } from "vite-plus/test";

import {
  EMPTY_COMPOSER_REFERENCE_RECENCY,
  isExactComposerReferenceMatch,
  isPrefixComposerReferenceMatch,
  rankComposerReferences,
  type ComposerReferenceCandidate,
} from "./composerReferenceRank.ts";

const candidate = (
  refId: string,
  matchKey: string,
  extra: Partial<ComposerReferenceCandidate> = {},
): ComposerReferenceCandidate => ({
  refId,
  query: extra.query ?? "",
  matchKey,
  recency: extra.recency ?? EMPTY_COMPOSER_REFERENCE_RECENCY,
  updatedAt: extra.updatedAt ?? null,
});

describe("isExactComposerReferenceMatch", () => {
  it("matches case-insensitively and only on the whole key", () => {
    expect(isExactComposerReferenceMatch("nx-12", "NX-12")).toBe(true);
    expect(isExactComposerReferenceMatch("123", "123")).toBe(true);
    expect(isExactComposerReferenceMatch("nx-", "NX-12")).toBe(false);
    expect(isExactComposerReferenceMatch("nx-12", "NX-123")).toBe(false);
    expect(isExactComposerReferenceMatch("", "NX-12")).toBe(false);
  });
});

describe("isPrefixComposerReferenceMatch", () => {
  it("matches a proper prefix but not an exact or reversed one", () => {
    expect(isPrefixComposerReferenceMatch("nx-12", "NX-123")).toBe(true);
    expect(isPrefixComposerReferenceMatch("nx-", "NX-123")).toBe(true);
    expect(isPrefixComposerReferenceMatch("nx-12", "NX-12")).toBe(false); // exact, not prefix
    expect(isPrefixComposerReferenceMatch("123", "NX-12")).toBe(false);
    expect(isPrefixComposerReferenceMatch("", "NX-12")).toBe(false);
  });
});

describe("rankComposerReferences", () => {
  it("orders exact match above prefix, above everything else", () => {
    const result = rankComposerReferences([
      candidate("NX-2", "NX-2", { query: "NX-1", updatedAt: Date.now() }),
      candidate("NX-123", "NX-123", { query: "NX-1", recency: { referencedInThread: true, lastUsedAt: null, useCount: 99 } }),
      candidate("NX-1", "NX-1", { query: "NX-1", updatedAt: 0 }),
    ]);
    expect(result.map((entry) => entry.refId)).toEqual(["NX-1", "NX-123", "NX-2"]);
  });

  it("ranks a thread reference above a newer last-used item", () => {
    const result = rankComposerReferences([
      candidate("A", "A", { recency: { lastUsedAt: 200, useCount: 1, referencedInThread: false } }),
      candidate("B", "B", { recency: { lastUsedAt: 10, useCount: 1, referencedInThread: true } }),
    ]);
    expect(result.map((entry) => entry.refId)).toEqual(["B", "A"]);
  });

  it("ranks last-used decayed above never-used, and use count above newer host update", () => {
    const result = rankComposerReferences([
      // Never used but host-updated just now: loses to a decayed-but-used item.
      candidate("fresh", "fresh", { updatedAt: 1000 }),
      // Used twice: useCount breaks the tie with the once-used item even though it is older.
      candidate("twice", "twice", { recency: { lastUsedAt: 500, useCount: 2, referencedInThread: false } }),
      candidate("once", "once", { recency: { lastUsedAt: 900, useCount: 1, referencedInThread: false } }),
    ]);
    // once (lastUsedAt 900) outranks twice (500); twice's useCount only matters on a tie.
    expect(result.map((entry) => entry.refId)).toEqual(["once", "twice", "fresh"]);
  });

  it("falls back to host updatedAt, then refId for determinism", () => {
    const result = rankComposerReferences([
      candidate("b", "b", { updatedAt: 100 }),
      candidate("a", "a", { updatedAt: 100 }),
      candidate("c", "c", { updatedAt: 200 }),
    ]);
    expect(result.map((entry) => entry.refId)).toEqual(["c", "a", "b"]);
  });

  it("leaves the caller's array untouched", () => {
    const entries = [candidate("a", "a", { updatedAt: 1 }), candidate("b", "b", { updatedAt: 2 })];
    const snapshot = entries.map((entry) => entry.refId);
    rankComposerReferences(entries);
    expect(entries.map((entry) => entry.refId)).toEqual(snapshot);
  });
});
