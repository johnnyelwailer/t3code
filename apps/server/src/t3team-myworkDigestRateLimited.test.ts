import { describe, expect, it } from "@effect/vitest";

import {
  LAST_GOOD_LISTING_MAX_AGE_MS,
  RATE_LIMITED_CHANGE_REQUEST_NOTE,
  isRateLimitedFailure,
  resolveDigestListing,
  type DigestListingMemory,
} from "./t3team-myworkDigestRateLimited.ts";

const pr = (repository: string, number: number) => ({ repository, number });
type Entry = ReturnType<typeof pr>;

describe("resolveDigestListing", () => {
  it("remembers a clean read and serves it while the host rate-limits", () => {
    const memory: DigestListingMemory<Entry> = new Map();
    const clean = [pr("org/web", 1), pr("org/api", 2)];
    resolveDigestListing({
      memory,
      projectId: "p",
      nowMs: 0,
      read: { _tag: "Success", entries: clean, hadErrors: false },
    });
    expect(
      resolveDigestListing({
        memory,
        projectId: "p",
        nowMs: 1_000,
        read: { _tag: "Failure", rateLimited: true, message: "paused" },
      }),
    ).toEqual({ entries: clean, stale: true, note: RATE_LIMITED_CHANGE_REQUEST_NOTE });
  });

  it("fills repositories a degraded read could not list, and never remembers that read", () => {
    const memory: DigestListingMemory<Entry> = new Map();
    resolveDigestListing({
      memory,
      projectId: "p",
      nowMs: 0,
      read: { _tag: "Success", entries: [pr("org/web", 1), pr("org/api", 2)], hadErrors: false },
    });
    // The listing "succeeds" with org/api unreadable: org/api's rows come from the last good read.
    const degraded = resolveDigestListing({
      memory,
      projectId: "p",
      nowMs: 1_000,
      read: { _tag: "Success", entries: [pr("org/web", 3)], hadErrors: true },
    });
    expect(degraded).toEqual({
      entries: [pr("org/web", 3), pr("org/api", 2)],
      stale: true,
      note: RATE_LIMITED_CHANGE_REQUEST_NOTE,
    });
    // A fully empty degraded read still finds the clean listing, not an empty one.
    const empty = resolveDigestListing({
      memory,
      projectId: "p",
      nowMs: 2_000,
      read: { _tag: "Success", entries: [], hadErrors: true },
    });
    expect(empty.entries).toEqual([pr("org/web", 1), pr("org/api", 2)]);
  });

  it("does not fall back on other failures, or to a listing that is too old", () => {
    const memory: DigestListingMemory<Entry> = new Map();
    resolveDigestListing({
      memory,
      projectId: "p",
      nowMs: 0,
      read: { _tag: "Success", entries: [pr("org/web", 1)], hadErrors: false },
    });
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
      }).stale,
    ).toBe(false);
  });
});

describe("isRateLimitedFailure", () => {
  it("finds a rate limit in the cause chain and nothing else", () => {
    expect(isRateLimitedFailure({ cause: { reason: "rate-limited" } })).toBe(true);
    expect(isRateLimitedFailure({ reason: "cli-unauthenticated" })).toBe(false);
    expect(isRateLimitedFailure(undefined)).toBe(false);
  });
});
