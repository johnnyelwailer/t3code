/**
 * Pure state machine for session-level transient-turn retry (split out of
 * `t3team-threadTransientTurnRetry.ts` for the additive LOC budget). The
 * tracker maintains per-thread retry state and emits decisions on terminal
 * turn events. No effects — unit-testable without a runtime.
 *
 * @module t3team-threadTransientTurnRetryTracker
 */
import {
  classifyTransientTurnFailure,
  readWatchdogStallWarning,
  transientTurnRetryBackoffMs,
  truncateStopReason,
  watchdogStallReason,
} from "./t3team-threadTransientTurnRetryPolicy.ts";
import {
  decisionForTransient,
  stallDecisionFor,
  type TransientTurnRetryDecision,
  type TransientTurnRetryState,
  type TransientTurnRetryTracker,
  type TransientTurnRetryTrackerOptions,
} from "./t3team-threadTransientTurnRetryDecision.ts";

export function createTransientTurnRetryTracker(
  options: TransientTurnRetryTrackerOptions = {},
): TransientTurnRetryTracker {
  const state = new Map<string, TransientTurnRetryState>();
  const resolveDelay =
    options.delayMs ??
    ((attempt, _reason, _directiveSeconds) => transientTurnRetryBackoffMs(attempt));

  const entryFor = (threadId: string): TransientTurnRetryState => {
    let entry = state.get(threadId);
    if (entry === undefined) {
      entry = { attempts: 0, stall: null, userStopped: false, lastTerminal: null };
      state.set(threadId, entry);
    }
    return entry;
  };

  return {
    state,

    onStallWarning(threadId, turnId, payload) {
      const stall = readWatchdogStallWarning(payload);
      if (stall === null || turnId === undefined) return;
      const entry = entryFor(threadId);
      entry.stall = { turnId, reason: watchdogStallReason(stall.inactivitySeconds) };
    },

    onTurnStarted(threadId) {
      const entry = entryFor(threadId);
      entry.userStopped = false;
      entry.lastTerminal = null;
    },

    onInterruptRequested(threadId) {
      const entry = entryFor(threadId);
      entry.userStopped = true;
      entry.stall = null;
    },

    onUserMessage(threadId) {
      state.delete(threadId);
    },

    onTurnTerminal(threadId, turnId, event) {
      const entry = entryFor(threadId);

      if (event.type === "session.exited") {
        const entry = state.get(threadId);
        if (entry === undefined || entry.lastTerminal !== "transient") {
          state.delete(threadId);
        }
        return undefined;
      }

      if (event.type === "turn.aborted") {
        const payload = event.payload as { readonly reason?: unknown } | null | undefined;
        const abortReason =
          typeof payload?.reason === "string" && payload.reason.trim().length > 0
            ? payload.reason
            : null;
        const stalled = stallDecisionFor(entry, turnId, resolveDelay);
        if (stalled !== null && !entry.userStopped) {
          entry.lastTerminal = "transient";
          return stalled;
        }
        entry.lastTerminal = "other";
        if (entry.userStopped) {
          entry.userStopped = false;
          return undefined;
        }
        if (abortReason !== null) {
          return { kind: "persist-reason", reason: truncateStopReason(abortReason) };
        }
        return undefined;
      }

      if (event.type !== "turn.completed") return undefined;
      const payload = event.payload as
        | { readonly state: string; readonly stopReason?: unknown; readonly errorMessage?: unknown }
        | null
        | undefined;
      if (payload === undefined || payload === null) return undefined;
      if (payload.state === "completed") {
        state.delete(threadId);
        return undefined;
      }
      const failure = classifyTransientTurnFailure(payload);
      if (failure !== null) {
        entry.lastTerminal = "transient";
        return decisionForTransient(entry, failure.reason, resolveDelay, failure.directiveSeconds);
      }
      if (payload.state === "interrupted" || payload.state === "cancelled") {
        const stalled = stallDecisionFor(entry, turnId, resolveDelay);
        if (stalled !== null && !entry.userStopped) {
          entry.lastTerminal = "transient";
          return stalled;
        }
        entry.lastTerminal = "other";
        if (entry.userStopped) {
          entry.userStopped = false;
          return undefined;
        }
        const stopReason =
          typeof payload.stopReason === "string" && payload.stopReason.trim().length > 0
            ? payload.stopReason
            : typeof payload.errorMessage === "string" && payload.errorMessage.trim().length > 0
              ? payload.errorMessage
              : "Turn ended without completing";
        return { kind: "persist-reason", reason: truncateStopReason(stopReason) };
      }
      entry.stall = null;
      entry.attempts = 0;
      entry.lastTerminal = "other";
      return undefined;
    },
  };
}
