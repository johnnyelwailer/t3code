import { describe, expect, it } from "@effect/vitest";

import {
  LAST_GOOD_LISTING_MAX_AGE_MS,
  INCOMPLETE_CHANGE_REQUEST_NOTE,
  isRateLimitedFailure,
  resolveDigestListing,
  type DigestListingMemory,
} from "./t3team-myworkDigestRateLimited.ts";

const pr = (repository: string, number: number, host = "ghe") => ({ host, repository, number });
type Entry = ReturnType<typeof pr>;
const success = (entries: Entry[], hadErrors = false) =>
  ({ _tag: "Success", entries, hadErrors }) as const;

describe("resolveDigestListing", () => {
  it("serves remembered repositories while the host rate-limits", () => {
    const memory: DigestListingMemory<Entry> = new Map();
    const clean = [pr("org/web", 1), pr("org/api", 2)];
    resolveDigestListing({ memory, projectId: "p", nowMs: 0, read: success(clean) });
    const paused = resolveDigestListing({
      memory,
      projectId: "p",
      nowMs: 1_000,
      read: { _tag: "Failure", rateLimited: true, message: "paused" },
    });
    expect(paused.stale).toBe(true);
    expect(paused.note).toBe(INCOMPLETE_CHANGE_REQUEST_NOTE);
    expect(paused.entries).toEqual(expect.arrayContaining(clean));
  });

  it("fills repositories a degraded read missed, even when the project never read cleanly", () => {
    const memory: DigestListingMemory<Entry> = new Map();
    // One repository is permanently unreadable: no read is ever clean, yet each read is remembered.
    resolveDigestListing({
      memory,
      projectId: "p",
      nowMs: 0,
      read: success([pr("org/web", 1), pr("org/api", 2)], true),
    });
    const degraded = resolveDigestListing({
      memory,
      projectId: "p",
      nowMs: 1_000,
      read: success([pr("org/web", 3)], true),
    });
    expect(degraded).toEqual({
      entries: [pr("org/web", 3), pr("org/api", 2)],
      stale: true,
      note: INCOMPLETE_CHANGE_REQUEST_NOTE,
    });
  });

  it("says a degraded read is incomplete even with nothing to fill", () => {
    const memory: DigestListingMemory<Entry> = new Map();
    expect(
      resolveDigestListing({ memory, projectId: "p", nowMs: 0, read: success([], true) }),
    ).toEqual({ entries: [], stale: true, note: INCOMPLETE_CHANGE_REQUEST_NOTE });
  });

  it("keeps the same repository name on two hosts apart", () => {
    const memory: DigestListingMemory<Entry> = new Map();
    resolveDigestListing({
      memory,
      projectId: "p",
      nowMs: 0,
      read: success([pr("org/web", 1, "github.com"), pr("org/web", 2, "ghe")]),
    });
    const degraded = resolveDigestListing({
      memory,
      projectId: "p",
      nowMs: 1_000,
      read: success([pr("org/web", 5, "github.com")], true),
    });
    expect(degraded.entries).toEqual([pr("org/web", 5, "github.com"), pr("org/web", 2, "ghe")]);
  });

  it("does not fall back on other failures, or to memory that is too old", () => {
    const memory: DigestListingMemory<Entry> = new Map();
    resolveDigestListing({ memory, projectId: "p", nowMs: 0, read: success([pr("org/web", 1)]) });
    expect(
      resolveDigestListing({
        memory,
        projectId: "p",
        nowMs: 1_000,
        read: { _tag: "Failure", rateLimited: false, message: "signed out" },
      }),
    ).toEqual({ entries: [], stale: false, note: "signed out" });
    expect(
      resolveDigestListing({
        memory,
        projectId: "p",
        nowMs: LAST_GOOD_LISTING_MAX_AGE_MS + 1,
        read: { _tag: "Failure", rateLimited: true, message: "paused" },
      }).entries,
    ).toEqual([]);
  });
});

describe("isRateLimitedFailure", () => {
  it("finds a rate limit in the cause chain and nothing else", () => {
    expect(isRateLimitedFailure({ cause: { reason: "rate-limited" } })).toBe(true);
    expect(isRateLimitedFailure({ reason: "cli-unauthenticated" })).toBe(false);
    expect(isRateLimitedFailure(undefined)).toBe(false);
  });
});
