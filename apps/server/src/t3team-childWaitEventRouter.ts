/**
 * Event routing for the durable child-wait reactor (GHE #55): turns a domain
 * event into the index/ledger/quiet-gate calls. Split from t3team-childWaitReactor.ts,
 * which keeps only the live wiring. @module t3team-childWaitEventRouter
 */
import { ThreadId, type OrchestrationEvent } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { type ProjectionSnapshotQueryShape } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import { deriveThreadRunState, type ThreadRunState } from "@t3tools/shared/t3team-threadRunStatus";
import {
  CHILD_WAIT_REGISTERED_KIND,
  CHILD_WAIT_RESOLVED_KIND,
  sessionStatusToWaitOutcome,
  type ChildWaitOn,
  type ChildWaitRecord,
} from "./t3team-childWait.ts";
import type { ChildWaitIndex } from "./t3team-childWaitIndex.ts";
import type { ChildCompletionQuiet } from "./t3team-childCompletionQuiet.ts";
import type { ResolveChildOutcome } from "./t3team-childWaitTerminal.ts";
import type { NotifyTerminalIfNoWaitInput } from "./t3team-childWaitTerminal.ts";

/** Map a derived run-state onto the terminal outcome we notify for (null when not terminal). */
function terminalFromRunState(state: ThreadRunState): "completed" | "failed" | "aborted" | null {
  return state === "completed" || state === "failed" || state === "aborted" ? state : null;
}

export interface ChildWaitEventRouterDeps {
  readonly index: ChildWaitIndex;
  readonly rearm: () => Promise<void>;
  readonly query: ProjectionSnapshotQueryShape;
  readonly resolveChildOutcome: ResolveChildOutcome;
  readonly noteResume: (childThreadId: string, seq: number) => void;
  readonly quiet: ChildCompletionQuiet;
  readonly notifyTerminalIfNoWait: (input: NotifyTerminalIfNoWaitInput) => Effect.Effect<void>;
}

export function makeChildWaitEventRouter(deps: ChildWaitEventRouterDeps) {
  const { index, rearm, query, resolveChildOutcome, noteResume, quiet, notifyTerminalIfNoWait } =
    deps;

  // A newly registered wait: index it; resolve now if the child is already terminal.
  const onRegistered = (record: ChildWaitRecord): Effect.Effect<void> =>
    Effect.gen(function* () {
      index.add(record);
      yield* Effect.promise(rearm);
      const child = Option.getOrUndefined(
        yield* query
          .getThreadShellById(ThreadId.make(record.childThreadId))
          .pipe(Effect.orElseSucceed(() => Option.none())),
      );
      if (!child) return;
      const state = deriveThreadRunState({
        session: child.session,
        latestTurn: child.latestTurn,
        ...(child.backgroundLiveness !== undefined
          ? { backgroundLiveness: child.backgroundLiveness }
          : {}),
      });
      const outcome = terminalFromRunState(state);
      if (outcome !== null) {
        yield* resolveChildOutcome(record.childThreadId, outcome);
      }
    });

  const handleEvent = (event: OrchestrationEvent): Effect.Effect<void> => {
    switch (event.type) {
      case "thread.activity-appended": {
        const activity = event.payload.activity;
        if (activity.kind === CHILD_WAIT_REGISTERED_KIND) {
          const payload = activity.payload as
            | {
                readonly waitId?: unknown;
                readonly childThreadId?: unknown;
                readonly childTitle?: unknown;
                readonly on?: unknown;
                readonly deadlineIso?: unknown;
              }
            | null
            | undefined;
          if (
            !payload ||
            typeof payload.waitId !== "string" ||
            typeof payload.childThreadId !== "string"
          ) {
            return Effect.void;
          }
          const on: ChildWaitOn =
            payload.on === "completed" || payload.on === "failed" ? payload.on : "terminal";
          return onRegistered({
            waitId: payload.waitId,
            parentThreadId: event.payload.threadId,
            childThreadId: payload.childThreadId,
            childTitle: typeof payload.childTitle === "string" ? payload.childTitle : "child",
            on,
            ...(typeof payload.deadlineIso === "string"
              ? { deadlineIso: payload.deadlineIso }
              : {}),
          });
        }
        if (activity.kind === CHILD_WAIT_RESOLVED_KIND) {
          const payload = activity.payload as { readonly waitId?: unknown } | null | undefined;
          if (payload && typeof payload.waitId === "string") {
            index.remove(payload.waitId);
            return Effect.promise(rearm);
          }
          return Effect.void;
        }
        return Effect.void;
      }
      case "thread.session-set": {
        const status = event.payload.session.status;
        const threadId = event.payload.threadId;
        // Epoch boundary: running/starting, or the host-stamped `superseded`
        // marker (a nudge replaced the in-flight turn — the child is running
        // the new turn, not stopped). Resuming re-arms the ledger so a later
        // stop still notifies, and CANCELS any pending completion quiet period.
        if (
          event.payload.session.superseded === true ||
          status === "running" ||
          status === "starting"
        ) {
          noteResume(threadId, event.sequence);
          quiet.noteResumed(threadId);
          return Effect.void;
        }
        const outcome = sessionStatusToWaitOutcome(status);
        if (outcome === null) return Effect.void;
        if (outcome === "completed") {
          // Settled, not terminal: defer the notice until the child has stayed
          // quiet for the quiet period (ready alone is inter-turn idle).
          quiet.noteSettled(threadId, event.sequence);
          return Effect.void;
        }
        // failed / aborted: a genuine terminal — notify immediately (ledger dedups).
        // Restart-caused terminal (the startup reconcile's stoppedByServerRestart
        // marker): the per-child notice would be restart noise — suppress it, but
        // still resolve matching waits. The parent's post-restart wake steer
        // lists the interrupted children instead.
        return notifyTerminalIfNoWait({
          childThreadId: threadId,
          outcome,
          lastError: event.payload.session.lastError,
          eventSequence: event.sequence,
          ...(event.payload.session.stoppedByServerRestart === true
            ? { suppressParentNotice: true }
            : {}),
        });
      }
      default:
        return Effect.void;
    }
  };

  return { handleEvent };
}
