import { describe, expect, it } from "@effect/vitest";

import {
  invalidateT3workTempoIssueKeyCache,
  withT3workIssueKeyCache,
} from "./t3work-tempoIssueKeyCache.ts";

describe("withT3workIssueKeyCache", () => {
  it("does not cache a thrown (transient) failure", async () => {
    invalidateT3workTempoIssueKeyCache();
    let calls = 0;
    const resolve = withT3workIssueKeyCache(async () => {
      calls += 1;
      throw new Error("boom");
    });
    expect(await resolve("issue-1")).toBeNull();
    expect(await resolve("issue-1")).toBeNull();
    expect(calls).toBe(2);
  });

  it("caches a genuine not-found (successful null) result", async () => {
    invalidateT3workTempoIssueKeyCache();
    let calls = 0;
    const resolve = withT3workIssueKeyCache(async () => {
      calls += 1;
      return null;
    });
    expect(await resolve("issue-2")).toBeNull();
    expect(await resolve("issue-2")).toBeNull();
    expect(calls).toBe(1);
  });

  it("caches a successful resolution", async () => {
    invalidateT3workTempoIssueKeyCache();
    let calls = 0;
    const resolve = withT3workIssueKeyCache(async () => {
      calls += 1;
      return "PROJ-1";
    });
    expect(await resolve("issue-3")).toBe("PROJ-1");
    expect(await resolve("issue-3")).toBe("PROJ-1");
    expect(calls).toBe(1);
  });

  it("evicts the oldest entry once the cap is exceeded", async () => {
    invalidateT3workTempoIssueKeyCache();
    const resolve = withT3workIssueKeyCache(async (issueId) => `key-${issueId}`);
    for (let i = 0; i < 2001; i++) {
      await resolve(`issue-cap-${i}`);
    }
    let calls = 0;
    const resolveTracked = withT3workIssueKeyCache(async (issueId) => {
      calls += 1;
      return `key-${issueId}`;
    });
    // The first-inserted entry (issue-cap-0) should have been evicted.
    await resolveTracked("issue-cap-0");
    expect(calls).toBe(1);
  });

  it("invalidateT3workTempoIssueKeyCache clears cached entries", async () => {
    invalidateT3workTempoIssueKeyCache();
    let calls = 0;
    const resolve = withT3workIssueKeyCache(async () => {
      calls += 1;
      return "PROJ-2";
    });
    await resolve("issue-4");
    invalidateT3workTempoIssueKeyCache();
    await resolve("issue-4");
    expect(calls).toBe(2);
  });
});
