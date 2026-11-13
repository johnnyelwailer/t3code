import { describe, expect, it } from "vite-plus/test";

import { WINDOWS_PACKAGED_PAYLOAD_FILE_LIMIT } from "../build-desktop-artifact.ts";
import {
  PREPARED_SERVER_CACHE_FILE_LIMIT,
  windowsPayloadBudgetViolation,
} from "./t3team-windowsPayloadBudget.ts";

// Real counts from the Windows release builds: rc.7 shipped 421 files of which 359 are packs
// (62 guarded); the 2026-11-02 upstream sync added the prepared bytecode cache (19 chunks +
// manifest.json = 20), which made the build report 82 guarded files against a budget of 80.
const RC7 = { totalFileCount: 421, bundledPackFileCount: 359, preparedCacheFileCount: 0 };
const WITH_CACHE = { totalFileCount: 441, bundledPackFileCount: 359, preparedCacheFileCount: 20 };
const FILE_LIMIT = WINDOWS_PACKAGED_PAYLOAD_FILE_LIMIT;

describe("windowsPayloadBudgetViolation", () => {
  it("keeps the fixed-runtime budget at the upstream value", () => {
    expect(FILE_LIMIT).toBe(80);
  });

  it("accepts the rc.7 payload and the same payload with the bytecode cache", () => {
    expect(windowsPayloadBudgetViolation({ ...RC7, fileLimit: FILE_LIMIT })).toBeUndefined();
    expect(windowsPayloadBudgetViolation({ ...WITH_CACHE, fileLimit: FILE_LIMIT })).toBeUndefined();
  });

  it("would have rejected the cache when it counted against the fixed-runtime budget", () => {
    expect(WITH_CACHE.totalFileCount - WITH_CACHE.bundledPackFileCount).toBe(82);
    expect(WITH_CACHE.totalFileCount - WITH_CACHE.bundledPackFileCount).toBeGreaterThan(FILE_LIMIT);
  });

  it("still rejects loose-file growth outside packs/ and the cache", () => {
    const grown = {
      ...WITH_CACHE,
      totalFileCount: WITH_CACHE.totalFileCount + (FILE_LIMIT - 62) + 1,
    };
    expect(windowsPayloadBudgetViolation({ ...grown, fileLimit: FILE_LIMIT })).toMatchObject({
      fileCount: FILE_LIMIT + 1,
      fileLimit: FILE_LIMIT,
    });
  });

  it("holds the cache to its own budget, with headroom over today's 20 files", () => {
    expect(PREPARED_SERVER_CACHE_FILE_LIMIT).toBeGreaterThan(20);
    const atLimit = {
      ...RC7,
      totalFileCount: RC7.totalFileCount + PREPARED_SERVER_CACHE_FILE_LIMIT,
      preparedCacheFileCount: PREPARED_SERVER_CACHE_FILE_LIMIT,
    };
    expect(windowsPayloadBudgetViolation({ ...atLimit, fileLimit: FILE_LIMIT })).toBeUndefined();
    const over = {
      ...atLimit,
      totalFileCount: atLimit.totalFileCount + 1,
      preparedCacheFileCount: PREPARED_SERVER_CACHE_FILE_LIMIT + 1,
    };
    expect(windowsPayloadBudgetViolation({ ...over, fileLimit: FILE_LIMIT })).toMatchObject({
      fileCount: PREPARED_SERVER_CACHE_FILE_LIMIT + 1,
      fileLimit: PREPARED_SERVER_CACHE_FILE_LIMIT,
    });
  });
});
