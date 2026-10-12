import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  isUserIdle,
  lastUserInteractionAt,
  USER_IDLE_AFTER_MS,
  watchUserActivity,
} from "./t3team-userActivity";

/** A document that records which listeners are currently attached. */
function stubDocument() {
  const target = new EventTarget();
  const attached = new Map<string, number>();
  const doc = {
    addEventListener: (type: string, listener: EventListener) => {
      attached.set(type, (attached.get(type) ?? 0) + 1);
      target.addEventListener(type, listener);
    },
    removeEventListener: (type: string, listener: EventListener) => {
      attached.set(type, (attached.get(type) ?? 0) - 1);
      target.removeEventListener(type, listener);
    },
    dispatchEvent: (event: Event) => target.dispatchEvent(event),
  };
  vi.stubGlobal("document", doc);
  const listenerCount = () => [...attached.values()].reduce((sum, count) => sum + count, 0);
  return { doc, listenerCount };
}

describe("t3team user activity", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("attaches the interaction listeners once however many watchers there are", () => {
    const { listenerCount } = stubDocument();
    expect(listenerCount()).toBe(0);
    const stopFirst = watchUserActivity(() => {});
    const attachedForOne = listenerCount();
    expect(attachedForOne).toBeGreaterThan(0);
    const stopSecond = watchUserActivity(() => {});
    expect(listenerCount()).toBe(attachedForOne);
    stopFirst();
    stopSecond();
  });

  it("detaches every listener when the last watcher leaves, and not before", () => {
    const { listenerCount } = stubDocument();
    const stopFirst = watchUserActivity(() => {});
    const stopSecond = watchUserActivity(() => {});
    stopFirst();
    expect(listenerCount()).toBeGreaterThan(0);
    stopSecond();
    expect(listenerCount()).toBe(0);
  });

  it("calls a watcher only for the first interaction after the window went idle", () => {
    const { doc } = stubDocument();
    const resume = vi.fn();
    const stop = watchUserActivity(resume);
    try {
      // Arriving started the clock; activity while present is not a resume.
      expect(isUserIdle()).toBe(false);
      expect(lastUserInteractionAt()).toBe(1_000_000);
      vi.advanceTimersByTime(USER_IDLE_AFTER_MS - 1);
      expect(isUserIdle()).toBe(false);
      doc.dispatchEvent(new Event("keydown"));
      expect(resume).not.toHaveBeenCalled();
      expect(lastUserInteractionAt()).toBe(1_000_000 + USER_IDLE_AFTER_MS - 1);
      // Idle exactly when the window has gone untouched for the full idle period.
      vi.advanceTimersByTime(USER_IDLE_AFTER_MS - 1);
      expect(isUserIdle()).toBe(false);
      vi.advanceTimersByTime(1);
      expect(isUserIdle()).toBe(true);
      doc.dispatchEvent(new Event("wheel"));
      expect(resume).toHaveBeenCalledTimes(1);
      expect(isUserIdle()).toBe(false);
      doc.dispatchEvent(new Event("pointermove"));
      expect(resume).toHaveBeenCalledTimes(1);
    } finally {
      stop();
    }
  });

  it("restarts the clock when a new first watcher arrives", () => {
    stubDocument();
    const stop = watchUserActivity(() => {});
    stop();
    vi.advanceTimersByTime(USER_IDLE_AFTER_MS * 2);
    const stopAgain = watchUserActivity(() => {});
    try {
      expect(isUserIdle()).toBe(false);
    } finally {
      stopAgain();
    }
  });
});
