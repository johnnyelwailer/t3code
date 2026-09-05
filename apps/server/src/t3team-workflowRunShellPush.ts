// @effect-diagnostics globalConsole:off -- fire-and-forget delivery failure log in a plain Promise path, outside any Effect runtime.
/**
 * Pushes a workflow run's launch thread through the sidebar's live shell stream.
 *
 * `apps/server/src/ws.ts`'s `subscribeShell` already re-pushes a thread's shell to every
 * connected client whenever ANY `OrchestrationEvent` with `aggregateKind: "thread"` lands for it
 * (see `toShellStreamEvent`'s default case) — that is the existing, reused seam. A durable
 * workflow run's `status`/`pendingKind`/`wakeAt` are computed by joining `workflow_runs` onto the
 * thread row (`ProjectionSnapshotQuery.getThreadShellById`), not stored as thread columns, so
 * there is no dedicated event type for "a run transitioned." Dispatching a field-less
 * `thread.meta.update` is how other reactors (`t3team-childStatusReactor.ts`,
 * `t3team-activityLabelReactor.ts`) already turn an unrelated state change into a thread-shell
 * refresh: the decider emits `thread.meta-updated` with only `threadId`/`updatedAt` set, the
 * projector's spread-of-defined-fields pattern leaves every other thread column untouched, and
 * the live stream refetches the shell — which now carries the fresh `workflowRunStatus`.
 */
import { CommandId, type OrchestrationCommand, ThreadId } from "@t3tools/contracts";

export interface PushWorkflowRunThreadShellInput {
  /** The run's `launchThreadId`; a headless run (no launch thread) is a no-op. */
  readonly launchThreadId: string | null | undefined;
  /** Absent for callers that never wired dispatch through (e.g. the recipe-harness launcher) —
   * a missing push capability is a no-op, never a thrown error. */
  readonly dispatch: ((command: OrchestrationCommand) => Promise<void>) | undefined;
  readonly newId: (() => string) | undefined;
}

/** Fire a no-op thread-meta touch so the sidebar's live shell stream refetches this run's launch
 * thread. One-way and swallows dispatch failures — a lost push must not fail a run; the client
 * still catches up on the next full snapshot (e.g. a reload). */
export function pushWorkflowRunThreadShell(input: PushWorkflowRunThreadShellInput): void {
  if (
    input.launchThreadId === null ||
    input.launchThreadId === undefined ||
    input.dispatch === undefined ||
    input.newId === undefined
  ) {
    return;
  }
  const dispatch = input.dispatch;
  const threadId = input.launchThreadId;
  void dispatch({
    type: "thread.meta.update",
    commandId: CommandId.make(`t3team-wf-shell-push:${input.newId()}`),
    threadId: ThreadId.make(threadId),
  }).catch((error: unknown) => {
    console.warn(`[t3team-workflow] shell push failed for launch thread ${threadId}:`, error);
  });
}

/** Collapses repeated `beforePrimitive`-style re-affirmations of the SAME status (the admission
 * queue re-validates `queued`→`running` before every durable step, not just on a real
 * transition) down to one push per actual status change. Holds one closure of `lastStatus` per
 * run — construct once per run lifecycle, call on every candidate transition. */
export function createWorkflowRunShellPusher(
  input: PushWorkflowRunThreadShellInput,
): (status: string) => void {
  let lastStatus: string | undefined;
  return (status: string): void => {
    if (lastStatus === status) return;
    lastStatus = status;
    pushWorkflowRunThreadShell(input);
  };
}
