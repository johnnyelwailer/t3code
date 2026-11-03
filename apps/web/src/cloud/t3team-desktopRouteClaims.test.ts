import { describe, expect, it } from "vite-plus/test";

import {
  isDesktopRouteOwnSubmit,
  isDesktopRouteRequestClaimed,
  markDesktopRouteOwnSubmit,
  runDesktopRouteOnce,
} from "./t3team-desktopRouteClaims";

const memoryStorage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
};

/** One lock shared by "windows": runs hold it one after another, as navigator.locks does. */
const sharedLock = () => {
  let tail: Promise<unknown> = Promise.resolve();
  return (run: () => Promise<void>) => {
    const next = tail.then(run, run);
    tail = next;
    return next;
  };
};

describe("runDesktopRouteOnce", () => {
  it("runs the work once per request id, across a restart that keeps the storage", async () => {
    const storage = memoryStorage();
    let runs = 0;
    const work = async () => (runs++, true);
    await runDesktopRouteOnce("req-a", work, { storage, locks: sharedLock() });
    await runDesktopRouteOnce("req-a", work, { storage, locks: sharedLock() });
    await runDesktopRouteOnce("req-b", work, { storage, locks: sharedLock() });
    expect(runs).toBe(2);
    expect(isDesktopRouteRequestClaimed("req-a", storage)).toBe(true);
  });

  it("two windows racing on one request run the work once", async () => {
    const storage = memoryStorage();
    const locks = sharedLock();
    let runs = 0;
    const work = async () => {
      await Promise.resolve();
      runs++;
      return true;
    };
    await Promise.all([
      runDesktopRouteOnce("req-race", work, { storage, locks }),
      runDesktopRouteOnce("req-race", work, { storage, locks }),
    ]);
    expect(runs).toBe(1);
  });

  it("does not claim a failed run, so another client can still act", async () => {
    const storage = memoryStorage();
    const locks = sharedLock();
    const outcomes = [false, true];
    let runs = 0;
    const work = async () => outcomes[runs++] ?? true;
    await runDesktopRouteOnce("req-retry", work, { storage, locks });
    expect(isDesktopRouteRequestClaimed("req-retry", storage)).toBe(false);
    await runDesktopRouteOnce("req-retry", work, { storage, locks });
    expect(runs).toBe(2);
    expect(isDesktopRouteRequestClaimed("req-retry", storage)).toBe(true);
  });

  it("still claims once when the storage cannot be written or read", async () => {
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("full");
      },
    };
    let runs = 0;
    const work = async () => (runs++, true);
    await runDesktopRouteOnce("req-broken", work, { storage: broken, locks: sharedLock() });
    await runDesktopRouteOnce("req-broken", work, { storage: broken, locks: sharedLock() });
    expect(runs).toBe(1);
  });
});

describe("own submit marks", () => {
  it("hold for a minute, then the observer may act on a request whose own submit never finished", () => {
    markDesktopRouteOwnSubmit("req-own", 1_000);
    expect(isDesktopRouteOwnSubmit("req-own", 30_000)).toBe(true);
    expect(isDesktopRouteOwnSubmit("req-own", 61_001)).toBe(false);
    expect(isDesktopRouteOwnSubmit("req-other", 2_000)).toBe(false);
  });
});
