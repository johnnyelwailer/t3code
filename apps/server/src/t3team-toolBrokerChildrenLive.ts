/**
 * Live wiring for the `t3team.thread.children` broker tool (GHE #55).
 *
 * Builds the `T3TeamChildrenToolDeps` the pure handler
 * (t3team-toolBrokerChildren.ts) needs over the live projection query +
 * orchestration engine, and returns the `(toolArgs, callerThreadId)` → result
 * closure the binding dispatch calls. Kept separate so the broker live stays
 * small (additive LOC budget).
 *
 * @module t3team-toolBrokerChildrenLive
 */
import { CommandId, type ProjectId, type ThreadId as ThreadIdType } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import type { ProjectionSnapshotQueryShape } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import { type T3TeamToolCallResult } from "./t3team-toolBroker.ts";
import { errorResult } from "./t3team-toolBrokerHelpers.ts";
import {
  callT3TeamChildrenTool,
  type T3TeamChildrenToolDeps,
} from "./t3team-toolBrokerChildren.ts";
import { appendThreadActivity } from "./t3team-toolBrokerStartChildActivity.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";

const normalizeError = (error: unknown): string =>
  typeof error === "string" ? error : error instanceof Error ? error.message : String(error);

export function makeManageChildrenHandler(input: {
  readonly query: ProjectionSnapshotQueryShape;
  readonly orchestration: OrchestrationEngineShape;
}): (toolArgs: unknown, callerThreadId: ThreadIdType) => Effect.Effect<T3TeamToolCallResult> {
  const { query, orchestration } = input;
  const nowIso = () => DateTime.formatIso(DateTime.nowUnsafe());

  const loadDetail = (threadId: ThreadIdType) =>
    query
      .getThreadDetailById(threadId)
      .pipe(Effect.map(Option.getOrUndefined), Effect.mapError(normalizeError));
  const loadShell = (threadId: ThreadIdType) =>
    query
      .getThreadShellById(threadId)
      .pipe(Effect.map(Option.getOrUndefined), Effect.mapError(normalizeError));
  const listProjectShells = (projectId: ProjectId) =>
    query.getShellSnapshot().pipe(
      Effect.map((snapshot) => snapshot.threads.filter((thread) => thread.projectId === projectId)),
      Effect.mapError(normalizeError),
    );
  const listChildThreadIds: T3TeamChildrenToolDeps["listChildThreadIds"] = (
    parentThreadId,
    projectId,
  ) =>
    query.listChildThreadIdsByParent(parentThreadId, projectId).pipe(
      Effect.map((ids) => ids.map((id) => id as unknown as string)),
      Effect.mapError(normalizeError),
    );
  const appendActivity: T3TeamChildrenToolDeps["appendActivity"] = (threadId, activity) =>
    appendThreadActivity(orchestration, threadId, {
      kind: activity.kind,
      summary: activity.summary,
      payload: activity.payload,
      createdAt: nowIso(),
    }).pipe(Effect.mapError(normalizeError));
  const interruptTurn: T3TeamChildrenToolDeps["interruptTurn"] = (threadId) =>
    orchestration
      .dispatch({
        type: "thread.turn.interrupt",
        commandId: CommandId.make(`server:t3team:children:stop:${t3teamRandomUUID()}`),
        threadId,
        t3teamStopOrigin: "system",
        createdAt: nowIso(),
      })
      .pipe(Effect.asVoid, Effect.mapError(normalizeError));
  const settleThread: T3TeamChildrenToolDeps["settleThread"] = (threadId) =>
    orchestration
      .dispatch({
        type: "thread.settle",
        commandId: CommandId.make(`server:t3team:children:sweep:${t3teamRandomUUID()}`),
        threadId,
      })
      .pipe(Effect.asVoid, Effect.mapError(normalizeError));

  return (toolArgs, callerThreadId) =>
    loadDetail(callerThreadId).pipe(
      Effect.flatMap((caller) => {
        if (!caller) {
          return Effect.succeed(errorResult("Current t3team thread was not found."));
        }
        const deps: T3TeamChildrenToolDeps = {
          callerThreadId,
          callerProjectId: caller.projectId,
          loadThreadDetail: loadDetail,
          loadThreadShell: loadShell,
          listProjectThreadShells: listProjectShells,
          listChildThreadIds,
          appendActivity,
          interruptTurn,
          settleThread,
          nowIso,
          newId: () => t3teamRandomUUID(),
        };
        return callT3TeamChildrenTool({ toolArgs, deps });
      }),
      Effect.catch((error) =>
        Effect.succeed(errorResult(`Failed to manage child sessions: ${error}`)),
      ),
    );
}
