import type { ScopedThreadRef } from "@t3tools/contracts";

/**
 * t3team: in-shell navigation override for upstream's Inbox sidebar.
 *
 * Upstream's `Sidebar` navigates to `/$environmentId/$threadId` — a route
 * OUTSIDE the `/t3team` tree. Inside the Team shell that navigation unmounts
 * the whole shell (backend provider, sidebar, every row), the upstream route
 * bridge translates the location, and a second navigation remounts the shell.
 * Two full remounts per thread click was the real cause of "the sidebar fully
 * re-renders on selection" (GHE #61) — no memoization can survive an unmount.
 *
 * The shell registers a handler here while the Inbox lens is mounted; upstream
 * consults it inside the click handler (never during render, so plain module
 * state is enough) and skips its own navigation when the shell handled it.
 * Deep links and any path the handler declines still flow through the route
 * bridge, which stays as the fallback.
 */
type ThreadNavigationOverride = (threadRef: ScopedThreadRef) => boolean;

let currentOverride: ThreadNavigationOverride | null = null;

export function setT3TeamThreadNavigationOverride(override: ThreadNavigationOverride | null): void {
  currentOverride = override;
}

/** Returns true when the Team shell handled the navigation. */
export function runT3TeamThreadNavigationOverride(threadRef: ScopedThreadRef): boolean {
  return currentOverride !== null && currentOverride(threadRef);
}
