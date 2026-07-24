import { describe, expect, it } from "@effect/vitest";

import {
  invalidateT3TeamTempoIssueKeyCache,
  withT3TeamIssueKeyCache,
} from "./t3team-tempoIssueKeyCache.ts";

describe("withT3TeamIssueKeyCache", () => {
  it("does not cache a thrown (transient) failure", async () => {
    invalidateT3TeamTempoIssueKeyCache();
    let calls = 0;
    const resolve = withT3TeamIssueKeyCache(async () => {
      calls += 1;
      throw new Error("boom");
    });
    expect(await resolve("issue-1")).toBeNull();
    expect(await resolve("issue-1")).toBeNull();
    expect(calls).toBe(2);
  });

  it("caches a genuine not-found (successful null) result", async () => {
    invalidateT3TeamTempoIssueKeyCache();
    let calls = 0;
    const resolve = withT3TeamIssueKeyCache(async () => {
      calls += 1;
      return null;
    });
    expect(await resolve("issue-2")).toBeNull();
    expect(await resolve("issue-2")).toBeNull();
    expect(calls).toBe(1);
  });

  it("caches a successful resolution", async () => {
    invalidateT3TeamTempoIssueKeyCache();
    let calls = 0;
    const resolve = withT3TeamIssueKeyCache(async () => {
      calls += 1;
      return "PROJ-1";
    });
    expect(await resolve("issue-3")).toBe("PROJ-1");
    expect(await resolve("issue-3")).toBe("PROJ-1");
    expect(calls).toBe(1);
  });

  it("evicts the oldest entry once the cap is exceeded", async () => {
    invalidateT3TeamTempoIssueKeyCache();
    const resolve = withT3TeamIssueKeyCache(async (issueId) => `key-${issueId}`);
    for (let i = 0; i < 2001; i++) {
      await resolve(`issue-cap-${i}`);
    }
    let calls = 0;
    const resolveTracked = withT3TeamIssueKeyCache(async (issueId) => {
      calls += 1;
      return `key-${issueId}`;
    });
    // The first-inserted entry (issue-cap-0) should have been evicted.
    await resolveTracked("issue-cap-0");
    expect(calls).toBe(1);
  });

  it("invalidateT3TeamTempoIssueKeyCache clears cached entries", async () => {
    invalidateT3TeamTempoIssueKeyCache();
    let calls = 0;
    const resolve = withT3TeamIssueKeyCache(async () => {
      calls += 1;
      return "PROJ-2";
    });
    await resolve("issue-4");
    invalidateT3TeamTempoIssueKeyCache();
    await resolve("issue-4");
    expect(calls).toBe(2);
  });
});
