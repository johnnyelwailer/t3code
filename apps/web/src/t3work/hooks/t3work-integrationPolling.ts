export const GITHUB_ACTIVITY_POLL_INTERVAL_MS = 60_000;
export const GITHUB_ACTIVITY_CACHE_MAX_AGE_MS = 60_000;
export const ATLASSIAN_RESOURCES_POLL_INTERVAL_MS = 90_000;
export const ATLASSIAN_RESOURCES_CACHE_MAX_AGE_MS = 90_000;
const POLL_RETRY_BASE_MS = 5_000;
const POLL_RETRY_MAX_MS = 60_000;

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

function nextPollRetryDelayMs(currentMs: number): number {
  return Math.min(currentMs > 0 ? currentMs * 2 : POLL_RETRY_BASE_MS, POLL_RETRY_MAX_MS);
}

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
  let inFlight = false;
  let retryDelayMs = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const clearScheduledPoll = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  const schedule = (minimumDelayMs = 0) => {
    if (disposed) {
      return;
    }
    if (inFlight) {
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

    timeoutId = setTimeout(
      () => {
        timeoutId = null;
        inFlight = true;
        const previousUpdatedAt = input.getUpdatedAt();
        void Promise.resolve(input.poll())
          .then(() => {
            const nextUpdatedAt = input.getUpdatedAt();
            if (nextUpdatedAt !== undefined && nextUpdatedAt !== previousUpdatedAt) {
              retryDelayMs = 0;
              return;
            }
            retryDelayMs = nextPollRetryDelayMs(retryDelayMs);
          })
          .catch(() => {
            retryDelayMs = nextPollRetryDelayMs(retryDelayMs);
          })
          .finally(() => {
            inFlight = false;
            schedule(retryDelayMs);
          });
      },
      Math.max(delayMs, minimumDelayMs),
    );
  };

  const handleVisibilityChange = () => {
    if (isPollingVisible(doc)) {
      schedule(retryDelayMs);
      return;
    }
    clearScheduledPoll();
  };

  const handleOnline = () => {
    schedule(retryDelayMs);
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
