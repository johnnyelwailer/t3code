/**
 * Per-thread home for the thread-bootstrap dispatch state.
 *
 * The bootstrap "have I already sent the kickoff / the thread.create for this thread?" flags used
 * to live in a `useRef` inside {@link import("./t3team-useThreadBootstrap").useThreadBootstrap}. A
 * ref is per *component instance*, and one recipe launch renders the thread view more than once:
 * the launch creates the thread and switches the surface in the same view transition, so the old
 * `ThreadChatView` unmounts and a new one mounts for the same `threadId`. The new instance got a
 * fresh ref (`kickoffSent: false`), planned `action: "kickoff"` again, and dispatched the kickoff a
 * second time — the orchestration store then rejected the second `thread.create`
 * ("Thread '…' already exists and cannot be created twice") and the launch died.
 *
 * A recipe launch always opens a fresh thread, so keying the state by `threadId` in module scope is
 * launch-once by construction — the same shape the recipe-workflow launch claim uses
 * ({@link import("./t3team-recipeLaunchDedup")}). Every `useThreadBootstrap` instance for a thread
 * shares one state object, so the second mount plans `action: "none"`.
 */

import {
  resolveThreadBootstrapDispatchState,
  type ThreadBootstrapDispatchState,
} from "~/t3team/chat/t3team-threadBootstrapPlan";

/** Keeps the map from growing without bound in a long-lived tab. */
const MAX_TRACKED_THREADS = 256;

const dispatchStatesByThreadId = new Map<string, ThreadBootstrapDispatchState>();

function evictOldestWhenFull(): void {
  while (dispatchStatesByThreadId.size >= MAX_TRACKED_THREADS) {
    const oldest = dispatchStatesByThreadId.keys().next();
    if (oldest.done) {
      return;
    }
    dispatchStatesByThreadId.delete(oldest.value);
  }
}

/**
 * The shared dispatch state for `threadId`, created on first use. Callers must treat the returned
 * object as the single source of truth and mutate it in place (the bootstrap sequence does).
 */
export function readThreadBootstrapDispatchState(threadId: string): ThreadBootstrapDispatchState {
  const existing = dispatchStatesByThreadId.get(threadId);
  if (existing) {
    return existing;
  }

  evictOldestWhenFull();
  const created = resolveThreadBootstrapDispatchState(undefined, threadId);
  dispatchStatesByThreadId.set(threadId, created);
  return created;
}

/** Drops the claim so an explicit user retry can bootstrap the thread again. */
export function resetThreadBootstrapDispatchState(threadId: string): void {
  dispatchStatesByThreadId.delete(threadId);
}

/** Test-only: clears every claim so cases cannot leak state into each other. */
export function clearThreadBootstrapDispatchStates(): void {
  dispatchStatesByThreadId.clear();
}
