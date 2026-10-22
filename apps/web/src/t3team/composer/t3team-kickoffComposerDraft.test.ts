// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import {
  KICKOFF_COMPOSER_DRAFT_MAX_AGE_MS,
  KICKOFF_COMPOSER_DRAFT_STORAGE_KEY,
  pruneKickoffComposerDrafts,
  readKickoffComposerDraft,
  resolveKickoffComposerDraftKey,
  writeKickoffComposerDraft,
} from "~/t3team/composer/t3team-kickoffComposerDraft";

describe("kickoff composer draft persistence", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => window.localStorage.clear());

  it("writes through on each change and reads it back", () => {
    writeKickoffComposerDraft("project:p1", "Fix the flaky login test");
    expect(window.localStorage.getItem(KICKOFF_COMPOSER_DRAFT_STORAGE_KEY)).toContain(
      "Fix the flaky login test",
    );
    expect(readKickoffComposerDraft("project:p1")).toBe("Fix the flaky login test");
    expect(readKickoffComposerDraft("project:p2")).toBeNull();
  });

  it("removes the entry when the text is cleared (e.g. after submit)", () => {
    writeKickoffComposerDraft("project:p1", "draft");
    writeKickoffComposerDraft("project:p2", "other");
    writeKickoffComposerDraft("project:p1", "");
    expect(readKickoffComposerDraft("project:p1")).toBeNull();
    expect(readKickoffComposerDraft("project:p2")).toBe("other");
  });

  it("ignores a null key and survives malformed storage", () => {
    writeKickoffComposerDraft(null, "nowhere");
    expect(window.localStorage.getItem(KICKOFF_COMPOSER_DRAFT_STORAGE_KEY)).toBeNull();
    window.localStorage.setItem(KICKOFF_COMPOSER_DRAFT_STORAGE_KEY, "{not json");
    expect(readKickoffComposerDraft("project:p1")).toBeNull();
    writeKickoffComposerDraft("project:p1", "recovers");
    expect(readKickoffComposerDraft("project:p1")).toBe("recovers");
  });

  it("prunes expired entries and keeps only the newest", () => {
    const now = 10 * KICKOFF_COMPOSER_DRAFT_MAX_AGE_MS;
    const pruned = pruneKickoffComposerDrafts(
      {
        old: { text: "old", updatedAt: now - KICKOFF_COMPOSER_DRAFT_MAX_AGE_MS - 1 },
        a: { text: "a", updatedAt: now - 3 },
        b: { text: "b", updatedAt: now - 2 },
        c: { text: "c", updatedAt: now - 1 },
        empty: { text: "", updatedAt: now },
      },
      now,
      2,
    );
    expect(Object.keys(pruned).toSorted()).toEqual(["b", "c"]);
  });

  it("resolves a stable key per surface", () => {
    expect(resolveKickoffComposerDraftKey({ projectId: "p1" })).toBe("project:p1");
    expect(resolveKickoffComposerDraftKey({})).toBe("project:all");
    expect(resolveKickoffComposerDraftKey({ draftKey: "ticket:p1:t9", projectId: "p1" })).toBe(
      "ticket:p1:t9",
    );
  });
});
