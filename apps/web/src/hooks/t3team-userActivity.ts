/**
 * Whether anybody is at the window. One notion, shared by everything that reads a host's API on a
 * timer (`useLiveRefresh`, the My Work and integration pollers): a window left open on a monitor
 * nobody is sitting at is "visible" in every sense the browser knows about, and polling it until
 * morning spends a night of somebody's rate limit on an answer nobody read.
 */

/** How long a showing window goes untouched before timers stop reading on its behalf. */
export const USER_IDLE_AFTER_MS = 6 * 60_000;

/**
 * When the reader last did anything. Shared rather than per view: a person is present in the
 * window, not in one component of it. Only tracked while something is watching.
 */
let lastInteractedAt = 0;
const interactionWatchers = new Set<() => void>();
const INTERACTION_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel"] as const;

export function lastUserInteractionAt(): number {
  return lastInteractedAt;
}

export function isUserIdle(now: number = Date.now()): boolean {
  return now - lastInteractedAt >= USER_IDLE_AFTER_MS;
}

const noteInteraction = () => {
  const wasIdle = isUserIdle();
  lastInteractedAt = Date.now();
  if (wasIdle) for (const resume of interactionWatchers) resume();
};

/**
 * Calls `resume` on the first interaction after the window went idle, and returns the cleanup.
 * Arriving is itself the reader doing something, so the first watcher starts the clock.
 */
export function watchUserActivity(resume: () => void): () => void {
  if (interactionWatchers.size === 0) {
    lastInteractedAt = Date.now();
    for (const event of INTERACTION_EVENTS) {
      document.addEventListener(event, noteInteraction, { passive: true });
    }
  }
  interactionWatchers.add(resume);
  return () => {
    interactionWatchers.delete(resume);
    if (interactionWatchers.size > 0) return;
    for (const event of INTERACTION_EVENTS) {
      document.removeEventListener(event, noteInteraction);
    }
  };
}
