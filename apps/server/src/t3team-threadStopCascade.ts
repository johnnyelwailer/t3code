/**
 * "Stop including sub-runs" on V2: interrupt a thread's active run and every
 * descendant subagent thread's active run. Descendants come from V2 lineage
 * (`shell.lineage`, `relationshipToParent: "subagent"`): delegated children,
 * workflow children and children re-linked by the V1 cutover. Forks are
 * independent threads and are never stopped with their source.
 *
 * Each stop is what the client's Stop button sends (`interruptThreadTurn`):
 * `run.interrupt` with `holdQueue: true` for the active run, or for the latest
 * run when only background work is left, so queued runs are held instead of
 * starting the moment the interrupt lands. Every thread in the cascade, idle or
 * not, also gets a mailbox hold, so no inter-agent digest restarts it.
 *
 * Every interrupt's command id is `t3team-cascade-stop:<request>:<thread>`:
 * deterministic per request, so a retried request is idempotent (V2 receipts
 * dedupe) while a later stop reaches a child an earlier one missed. The prefix
 * also marks the stop as user-raised for the workflow engine
 * (`isUserStopCommandId`), which stops the workflows of every thread in the
 * cascade.
 * @module t3team-threadStopCascade
 */
import {
  CommandId,
  isProviderNativeSubagentThread,
  type OrchestrationV2ThreadShell,
  type T3TeamStopThreadCascadeInput,
  type T3TeamStopThreadCascadeOutcome,
  type T3TeamStopThreadCascadeResult,
  type ThreadId,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import { ThreadManagementService } from "./orchestration-v2/ThreadManagementService.ts";
import type { T3TeamActorMailbox } from "./t3team-actorMailboxService.ts";
import { STOP_CASCADE_COMMAND_PREFIX } from "./t3team-actorMessageReactor.ts";

/**
 * Breadth-first descendants of `rootThreadId` over app-owned subagent lineage
 * (root excluded). Provider-native subagents are left out: the provider runs
 * them inside the parent's turn, so they stop with it.
 */
export function collectSubagentDescendants(
  rootThreadId: string,
  shells: ReadonlyArray<Pick<OrchestrationV2ThreadShell, "id" | "lineage" | "creationSource">>,
): ReadonlyArray<ThreadId> {
  const childrenOf = new Map<string, ThreadId[]>();
  for (const shell of shells) {
    const parent = shell.lineage.parentThreadId;
    if (parent === null || shell.lineage.relationshipToParent !== "subagent") continue;
    if (isProviderNativeSubagentThread(shell)) continue;
    childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), shell.id]);
  }
  const visited = new Set<string>([rootThreadId]);
  const descendants: ThreadId[] = [];
  let frontier: ReadonlyArray<string> = [rootThreadId];
  while (frontier.length > 0) {
    const next: ThreadId[] = [];
    for (const parent of frontier) {
      for (const child of childrenOf.get(parent) ?? []) {
        if (visited.has(child)) continue; // a corrupt cycle must not hang the stop
        visited.add(child);
        descendants.push(child);
        next.push(child);
      }
    }
    frontier = next;
  }
  return descendants;
}

export const cascadeStopCommandId = (requestCommandId: string, threadId: string) =>
  CommandId.make(`${STOP_CASCADE_COMMAND_PREFIX}${requestCommandId}:${threadId}`);

/** The run the client's Stop targets: the active run, else the latest one while background work remains. */
export const stoppableRunId = (
  shell: Pick<OrchestrationV2ThreadShell, "activeRunId" | "latestRunId" | "pendingBackgroundTasks">,
) =>
  shell.activeRunId ?? ((shell.pendingBackgroundTasks?.length ?? 0) > 0 ? shell.latestRunId : null);

export const stopThreadCascade = Effect.fn("t3team.stopThreadCascade")(function* (
  input: T3TeamStopThreadCascadeInput,
  mailbox?: T3TeamActorMailbox["Service"],
) {
  const threads = yield* ThreadManagementService;
  const snapshot = yield* threads.getShellSnapshot({ location: "active" }).pipe(
    Effect.map((value) => value.threads),
    Effect.catchCause((cause) =>
      Cause.hasInterruptsOnly(cause)
        ? Effect.interrupt
        : Effect.logWarning("t3team stop cascade could not read thread shells", {
            cause: Cause.pretty(cause),
          }).pipe(Effect.as<ReadonlyArray<OrchestrationV2ThreadShell>>([])),
    ),
  );
  const shellOf = new Map(snapshot.map((shell) => [shell.id as string, shell]));
  const heldAt = DateTime.formatIso(DateTime.nowUnsafe());

  const interrupt = (threadId: ThreadId) =>
    Effect.gen(function* () {
      const shell = shellOf.get(threadId) ?? (yield* threads.getThreadShell(threadId));
      if (shell === null || shell === undefined) return "failed" as const;
      if (mailbox !== undefined) yield* mailbox.store.hold(threadId, heldAt);
      const runId = stoppableRunId(shell);
      if (runId === null) return "no_active_run" as const;
      yield* threads.dispatch({
        type: "run.interrupt",
        commandId: cascadeStopCommandId(input.commandId, threadId),
        threadId,
        runId,
        holdQueue: true,
        reason: "Stopped with its parent thread.",
      });
      return "interrupt_requested" as const;
    }).pipe(
      Effect.catchCause((cause) =>
        Cause.hasInterruptsOnly(cause)
          ? Effect.interrupt
          : Effect.logWarning("t3team stop cascade could not interrupt a thread", {
              threadId,
              cause: Cause.pretty(cause),
            }).pipe(Effect.as<T3TeamStopThreadCascadeOutcome>("failed")),
      ),
    );

  const root = yield* interrupt(input.threadId);
  const descendants = collectSubagentDescendants(input.threadId, snapshot);
  const outcomes = yield* Effect.forEach(descendants, interrupt, { concurrency: 4 });
  return {
    root,
    descendants: {
      found: descendants.length,
      interrupted: outcomes.filter((outcome) => outcome === "interrupt_requested").length,
      failed: outcomes.filter((outcome) => outcome === "failed").length,
    },
  } satisfies T3TeamStopThreadCascadeResult;
});
