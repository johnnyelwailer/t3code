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
import { CommandId, ThreadId as ThreadIdBrand, type ProjectId, type ThreadId as ThreadIdType } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import type { ProjectionSnapshotQueryShape } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import type { T3TeamActorMailboxShape } from "./t3team-actorMailbox.ts";
import { startActorReaction } from "./t3team-actorMessageReaction.ts";
import { isThreadBusy, resolveActorMessageBatchMax } from "./t3team-actorMessageReactorLimits.ts";
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
  /** Shared inter-agent mailbox for the `drain` op (absent in hosts without the reactor). */
  readonly mailbox?: T3TeamActorMailboxShape;
}): (toolArgs: unknown, callerThreadId: ThreadIdType) => Effect.Effect<T3TeamToolCallResult> {
  const { query, orchestration, mailbox } = input;
  const batchMax = resolveActorMessageBatchMax();
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
  const listParentChildRelations: T3TeamChildrenToolDeps["listParentChildRelations"] = () =>
    query.listParentChildRelations().pipe(
      Effect.map((rows) =>
        rows.map((row) => ({
          childThreadId: String(row.childThreadId),
          parentThreadId: String(row.parentThreadId),
        })),
      ),
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
        // A stop issued through the children tool is a deliberate stop issued on the
        // user's behalf — not internal automation. It must carry "user" origin so the
        // downstream byUser suppression applies: without it, the thread's queued
        // inter-agent messages drain on settle and re-open the turn the stop just
        // ended, making the stop momentary.
        t3teamStopOrigin: "user",
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

  // `drain`: claim the caller's OWN inter-agent mailbox now, reusing the SAME
  // primitives the reactor uses (shared mailbox, startActorReaction) — one
  // drain path, no second dispatcher. The caller detail is already loaded by
  // the returned closure; the busy check re-reads it fresh at call time.
  const drainOwnMailbox = (threadId: ThreadIdType): T3TeamChildrenToolDeps["drainOwnMailbox"] => () =>
    Effect.gen(function* () {
      if (mailbox === undefined) {
        return yield* Effect.fail("inter-agent mailbox is not available in this host");
      }
      const pending = yield* mailbox.peekPending(threadId);
      if (pending.length === 0) {
        // Nothing owed: report dispatched-zero so the caller learns the inbox
        // is clean rather than guessing.
        return { state: "dispatched" as const, delivered: 0, subjects: [] as string[] };
      }
      const subjects = pending.map((entry) => entry.summary?.trim() || entry.text.slice(0, 80));
      if (yield* mailbox.isSuppressed(threadId)) {
        return {
          state: "held" as const,
          held: pending.length,
          subjects,
          note:
            "auto-dispatch is suppressed for this thread (its turn was stopped by the user); " +
            "the messages stay visible in the timeline and drain when the user re-engages",
        };
      }
      const thread = yield* query
        .getThreadShellById(threadId)
        .pipe(Effect.map(Option.getOrUndefined));
      if (!thread) {
        return yield* Effect.fail("current thread was not found");
      }
      if (isThreadBusy(thread)) {
        return {
          state: "queued" as const,
          queued: pending.length,
          subjects,
          note:
            "this thread is mid-turn; the digest arrives when the turn ends (boundary drain)",
        };
      }
      const batch = yield* mailbox.takeNextForDispatch(threadId, batchMax);
      if (batch.length === 0) {
        // A racing reactor drain claimed the batch first — report it.
        return {
          state: "queued" as const,
          queued: pending.length,
          subjects,
          note: "a concurrent drain already claimed this batch; it is being delivered",
        };
      }
      // Once-per-session standing instruction, mirroring the reactor's gate.
      const includeStanding = !(yield* mailbox.isBriefed(threadId));
      const dispatched = yield* startActorReaction({
        engine: orchestration,
        mailbox,
        threadId,
        loadThread: (id) =>
          query.getThreadDetailById(ThreadIdBrand.make(id)).pipe(
            Effect.orElseSucceed(() => Option.none()),
            Effect.map(Option.getOrUndefined),
          ),
        entries: batch,
        includeStandingInstruction: includeStanding,
      });
      if (!dispatched) {
        return {
          state: "queued" as const,
          queued: batch.length,
          subjects: batch.map((entry) => entry.summary?.trim() || entry.text.slice(0, 80)),
          note:
            "the digest turn failed to start; the batch was requeued and the boundary drain will retry",
        };
      }
      if (includeStanding) {
        yield* mailbox.markBriefed(threadId);
      }
      return {
        state: "dispatched" as const,
        delivered: batch.length,
        subjects: batch.map((entry) => entry.summary?.trim() || entry.text.slice(0, 80)),
      };
    }).pipe(Effect.mapError(normalizeError));

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
          listParentChildRelations,
          appendActivity,
          interruptTurn,
          settleThread,
          drainOwnMailbox: drainOwnMailbox(callerThreadId),
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
