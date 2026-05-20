export const GITHUB_ACTIVITY_POLL_INTERVAL_MS = 60_000;
export const GITHUB_ACTIVITY_CACHE_MAX_AGE_MS = 60_000;
export const ATLASSIAN_RESOURCES_POLL_INTERVAL_MS = 90_000;
export const ATLASSIAN_RESOURCES_CACHE_MAX_AGE_MS = 90_000;

type PollingDelayInput = {
  readonly enabled: boolean;
  readonly intervalMs: number;
  readonly maxAgeMs: number;
  readonly updatedAt?: number;
  readonly nowMs: number;
  readonly isVisible: boolean;
  readonly isOnline: boolean;
};

type BrowserPollController = {
  readonly dispose: () => void;
};

export function isPollingVisible(doc?: Pick<Document, "visibilityState">): boolean {
  return doc?.visibilityState !== "hidden";
}

export function isPollingOnline(nav?: Pick<Navigator, "onLine">): boolean {
  return nav?.onLine !== false;
}

export function computeNextPollDelayMs(input: PollingDelayInput): number | null {
  if (!input.enabled || !input.isVisible || !input.isOnline) {
    return null;
  }

  if (input.updatedAt === undefined) {
    return 0;
  }

  const ageMs = Math.max(0, input.nowMs - input.updatedAt);
  if (ageMs >= input.maxAgeMs) {
    return 0;
  }

  return Math.min(input.intervalMs, input.maxAgeMs - ageMs);
}

export function startBrowserPolling(input: {
  readonly enabled: boolean;
  readonly intervalMs: number;
  readonly maxAgeMs: number;
  readonly getUpdatedAt: () => number | undefined;
  readonly poll: () => Promise<void> | void;
}): BrowserPollController {
  const doc = typeof document === "undefined" ? undefined : document;
  const nav = typeof navigator === "undefined" ? undefined : navigator;

  let disposed = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const clearScheduledPoll = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  const schedule = () => {
    if (disposed) {
      return;
    }

    clearScheduledPoll();

    const updatedAt = input.getUpdatedAt();

    const delayMs = computeNextPollDelayMs({
      enabled: input.enabled,
      intervalMs: input.intervalMs,
      maxAgeMs: input.maxAgeMs,
      ...(updatedAt !== undefined ? { updatedAt } : {}),
      nowMs: Date.now(),
      isVisible: isPollingVisible(doc),
      isOnline: isPollingOnline(nav),
    });

    if (delayMs === null) {
      return;
    }

    timeoutId = setTimeout(() => {
      timeoutId = null;
      void Promise.resolve(input.poll()).finally(schedule);
    }, delayMs);
  };

  const handleVisibilityChange = () => {
    if (isPollingVisible(doc)) {
      schedule();
      return;
    }
    clearScheduledPoll();
  };

  const handleOnline = () => {
    schedule();
  };

  if (doc) {
    doc.addEventListener("visibilitychange", handleVisibilityChange);
  }
  if (typeof window !== "undefined") {
    window.addEventListener("online", handleOnline);
  }

  schedule();

  return {
    dispose() {
      disposed = true;
      clearScheduledPoll();
      if (doc) {
        doc.removeEventListener("visibilitychange", handleVisibilityChange);
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("online", handleOnline);
      }
    },
  };
}
