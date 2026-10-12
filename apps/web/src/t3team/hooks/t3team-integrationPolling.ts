export const GITHUB_ACTIVITY_POLL_INTERVAL_MS = 60_000;
export const GITHUB_ACTIVITY_CACHE_MAX_AGE_MS = 60_000;
export const ATLASSIAN_RESOURCES_POLL_INTERVAL_MS = 90_000;
export const ATLASSIAN_RESOURCES_CACHE_MAX_AGE_MS = 90_000;
import { isUserIdle, watchUserActivity } from "~/hooks/t3team-userActivity";

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
  /** The reader has stopped touching the window; a poll would be for nobody. Defaults to false. */
  readonly isIdle?: boolean;
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
  if (!input.enabled || !input.isVisible || !input.isOnline || input.isIdle) {
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
  // The reader came back while a poll was in flight, where `schedule` does nothing.
  let resumeRequested = false;
  // A freshly mounted view always gets its first read; only later reads wait on the reader.
  let hasPolled = false;
  const isIdle = () => hasPolled && doc !== undefined && isUserIdle();
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
      isIdle: isIdle(),
    });

    if (delayMs === null) {
      return;
    }

    timeoutId = setTimeout(
      () => {
        timeoutId = null;
        // Went idle while this was waiting: stand down until the reader's next interaction.
        if (isIdle()) {
          return;
        }
        hasPolled = true;
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
            const resuming = resumeRequested;
            resumeRequested = false;
            schedule(resuming ? 0 : retryDelayMs);
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

  // The first interaction after going idle re-arms with one read if the data went stale.
  // The reader is back, so backoff from earlier failed or no-op polls does not apply: freshness
  // alone decides whether a read is due. (Visibility and online changes keep the backoff.)
  const stopWatchingActivity = doc
    ? watchUserActivity(() => {
        if (inFlight) resumeRequested = true;
        else schedule(0);
      })
    : undefined;
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
      stopWatchingActivity?.();
      if (doc) {
        doc.removeEventListener("visibilitychange", handleVisibilityChange);
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("online", handleOnline);
      }
    },
  };
}
