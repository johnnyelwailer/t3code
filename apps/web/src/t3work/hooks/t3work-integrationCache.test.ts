import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isIntegrationCacheFresh,
  readIntegrationCache,
  writeIntegrationCache,
} from "./t3work-integrationCache";

const localStorageState = new Map<string, string>();

const localStorageMock = {
  getItem(key: string) {
    return localStorageState.get(key) ?? null;
  },
  setItem(key: string, value: string) {
    localStorageState.set(key, value);
  },
  removeItem(key: string) {
    localStorageState.delete(key);
  },
  clear() {
    localStorageState.clear();
  },
};

let cacheKeyCounter = 0;

function nextCacheKey(): string {
  cacheKeyCounter += 1;
  return `integration-cache-test-${cacheKeyCounter}`;
}

beforeEach(() => {
  localStorageState.clear();
  vi.unstubAllGlobals();
  vi.stubGlobal("window", { localStorage: localStorageMock });
});

describe("t3work integration cache", () => {
  it("treats records inside max age as fresh", () => {
    expect(isIntegrationCacheFresh(1_000, 500, 1_500)).toBe(true);
  });

  it("treats records beyond max age as stale", () => {
    expect(isIntegrationCacheFresh(1_000, 499, 1_500)).toBe(false);
  });

  it("returns the cached record while it is still fresh", () => {
    const key = nextCacheKey();

    writeIntegrationCache(key, { id: "fresh" });

    const record = readIntegrationCache<{ id: string }>(key);

    expect(record?.value).toEqual({ id: "fresh" });
    expect(
      readIntegrationCache<{ id: string }>(key, {
        maxAgeMs: 5_000,
        nowMs: (record?.updatedAt ?? 0) + 5_000,
      }),
    ).toEqual(record);
  });

  it("returns null when an in-memory record is older than max age", () => {
    const key = nextCacheKey();

    writeIntegrationCache(key, { id: "stale" });
    const record = readIntegrationCache<{ id: string }>(key);

    expect(
      readIntegrationCache<{ id: string }>(key, {
        maxAgeMs: 1,
        nowMs: (record?.updatedAt ?? 0) + 2,
      }),
    ).toBeNull();
  });

  it("returns null when a persisted record is older than max age", () => {
    const key = nextCacheKey();

    localStorageMock.setItem(
      `t3work.integration-cache.v1:${key}`,
      JSON.stringify({ value: { id: "persisted" }, updatedAt: 1_000 }),
    );

    expect(
      readIntegrationCache<{ id: string }>(key, {
        maxAgeMs: 999,
        nowMs: 2_000,
      }),
    ).toBeNull();
  });

  it("persists custom timestamps and fingerprints", () => {
    const key = nextCacheKey();

    writeIntegrationCache(
      key,
      { id: "fingerprinted" },
      { updatedAt: 2_000, fingerprint: "sha256:abc" },
    );

    expect(readIntegrationCache<{ id: string }>(key)).toEqual({
      value: { id: "fingerprinted" },
      updatedAt: 2_000,
      fingerprint: "sha256:abc",
    });
  });
});
