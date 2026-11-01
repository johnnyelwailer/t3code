import { describe, expect, it } from "vite-plus/test";

import { claimDesktopRouteRequest } from "./t3team-desktopRouteClaims";

const memoryStorage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
};

describe("claimDesktopRouteRequest", () => {
  it("is true once per request id, across a restart that keeps the storage", () => {
    const storage = memoryStorage();
    expect(claimDesktopRouteRequest("req-a", storage)).toBe(true);
    expect(claimDesktopRouteRequest("req-a", storage)).toBe(false);
    expect(claimDesktopRouteRequest("req-b", storage)).toBe(true);
  });

  it("still claims once when the storage cannot be written or read", () => {
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("full");
      },
    };
    expect(claimDesktopRouteRequest("req-broken", broken)).toBe(true);
    expect(claimDesktopRouteRequest("req-broken", broken)).toBe(false);
  });
});
