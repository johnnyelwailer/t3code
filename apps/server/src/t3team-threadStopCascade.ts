/**
 * "Stop including sub-runs" on V2: interrupt a thread's active run and every
 * descendant subagent thread's active run. Descendants come from V2 lineage
 * (`shell.lineage`, `relationshipToParent: "subagent"`): delegated children,
 * workflow children and children re-linked by the V1 cutover. Forks are
 * independent threads and are never stopped with their source.
 *
 * Every interrupt's command id is `t3team-cascade-stop:<request>:<thread>`:
 * deterministic per request, so a retried request is idempotent (V2 receipts
 * dedupe) while a later stop reaches a child an earlier one missed. The prefix
 * also marks the stop as user-raised for the fork mailbox and the workflow
 * engine (`isUserStopCommandId`), which stop delivering into and stop the
 * workflows of every thread in the cascade.
 * @module t3team-threadStopCascade
 */
import {
  CommandId,
  type OrchestrationV2ThreadShell,
  type T3TeamStopThreadCascadeInput,
  type T3TeamStopThreadCascadeOutcome,
  type T3TeamStopThreadCascadeResult,
  type ThreadId,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";

import { ThreadManagementService } from "./orchestration-v2/ThreadManagementService.ts";
import { STOP_CASCADE_COMMAND_PREFIX } from "./t3team-actorMessageReactor.ts";

/** Breadth-first descendants of `rootThreadId` over subagent lineage (root excluded). */
export function collectSubagentDescendants(
  rootThreadId: string,
  shells: ReadonlyArray<Pick<OrchestrationV2ThreadShell, "id" | "lineage">>,
): ReadonlyArray<ThreadId> {
  const childrenOf = new Map<string, ThreadId[]>();
  for (const shell of shells) {
    const parent = shell.lineage.parentThreadId;
    if (parent === null || shell.lineage.relationshipToParent !== "subagent") continue;
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

export const stopThreadCascade = Effect.fn("t3team.stopThreadCascade")(function* (
  input: T3TeamStopThreadCascadeInput,
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
  const projectOf = new Map(snapshot.map((shell) => [shell.id as string, shell.projectId]));

  const interrupt = (threadId: ThreadId) =>
    Effect.gen(function* () {
      const projectId =
        projectOf.get(threadId) ?? (yield* threads.getThreadShell(threadId))?.projectId;
      if (projectId === undefined) return "failed" as const;
      const result = yield* threads.interruptThread({
        projectId,
        threadId,
        commandId: cascadeStopCommandId(input.commandId, threadId),
        reason: "Stopped with its parent thread.",
      });
      return result.type === "interrupt_requested" ? result.type : ("no_active_run" as const);
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
