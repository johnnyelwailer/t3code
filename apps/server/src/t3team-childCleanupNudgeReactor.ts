// @effect-diagnostics globalDate:off -- the nudge stamps wall-clock time.
// @effect-diagnostics globalTimers:off -- the reactor owns the event stream subscription.
/**
 * Live wiring for the counter-driven orchestrator cleanup nudge (GHE #304
 * part C): reacts to child terminal-state transitions (thread.session-set
 * landing on idle/ready/error/interrupted/stopped) and, at startup, scans
 * every parent for backlogged terminal children; when a parent's UNSETTLED
 * terminal children cross the threshold and the dedup/cooldown allows it
 * (t3team-childCleanupNudge.ts), ONE compact digest actor message is
 * dispatched to the parent — the same channel the child-wait resolution and
 * abnormal-stop notifications use, which drives the parent's agent to react
 * — plus a durable `t3team.child_cleanup.nudged` activity that rehydrates
 * the dedup state after a restart.
 *
 * @module t3team-childCleanupNudgeReactor
 */
import {
  CommandId,
  EventId,
  MessageId,
  NonNegativeInt,
  ProjectId,
  ThreadId,
  type OrchestrationEvent,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";

import { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import { sessionStatusToWaitOutcome } from "./t3team-childWait.ts";
import { findHandoffParentThreadId } from "./t3team-childAbnormalStopNotify.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";
import {
  buildCleanupNudgeText,
  childCleanupNudgeAt,
  childCleanupNudgeCooldownMs,
  CHILD_CLEANUP_NUDGED_KIND,
  collectLastCleanupNudges,
  cleanupNudgeDue,
  terminalUnsettledChildStats,
  type CleanupNudgeStats,
} from "./t3team-childCleanupNudge.ts";

export const T3TeamChildCleanupNudgeReactorLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const engine = yield* OrchestrationEngineService;
    const query = yield* ProjectionSnapshotQuery;
    const lastByParent = new Map<string, { readonly atMs: number; readonly nudgedCount: number }>();

    const emitNudge = (input: {
      readonly parentThreadId: string;
      readonly projectId: ProjectId;
      readonly stats: CleanupNudgeStats;
    }) =>
      Effect.gen(function* () {
        const nowIso = DateTime.formatIso(DateTime.nowUnsafe());
        const topChild = input.stats.top[0];
        const fromThreadId = ThreadId.make(topChild?.threadId ?? input.parentThreadId);
        const fromShell = topChild
          ? Option.getOrUndefined(
              yield* query
                .getThreadShellById(fromThreadId)
                .pipe(Effect.orElseSucceed(() => Option.none())),
            )
          : undefined;
        const text = buildCleanupNudgeText(input.stats);
        yield* engine
          .dispatch({
            type: "thread.actor.message",
            commandId: CommandId.make(`server:child-cleanup-nudge:${t3teamRandomUUID()}`),
            threadId: ThreadId.make(input.parentThreadId),
            messageId: MessageId.make(t3teamRandomUUID()),
            fromThreadId,
            fromTitle: fromShell?.title ?? topChild?.title ?? "child cleanup",
            fromProjectId: input.projectId,
            text,
            urgency: "normal",
            hopCount: NonNegativeInt.make(0),
            rootThreadId: ThreadId.make(input.parentThreadId),
            createdAt: nowIso,
          })
          .pipe(
            Effect.catchCause((cause) =>
              Effect.logWarning("child-cleanup nudge actor message failed", {
                parentThreadId: input.parentThreadId,
                cause: Cause.pretty(cause),
              }),
            ),
          );
        // The durable dedup marker (also the visible record on the parent).
        yield* engine
          .dispatch({
            type: "thread.activity.append",
            commandId: CommandId.make(`server:child-cleanup-nudge:${t3teamRandomUUID()}`),
            threadId: ThreadId.make(input.parentThreadId),
            activity: {
              id: EventId.make(t3teamRandomUUID()),
              tone: "info",
              kind: CHILD_CLEANUP_NUDGED_KIND,
              summary: `Cleanup nudge: ${input.stats.count} terminal children`,
              payload: { at: nowIso, count: input.stats.count },
              turnId: null,
              createdAt: nowIso,
            },
            createdAt: nowIso,
          })
          .pipe(
            Effect.catchCause((cause) =>
              Effect.logWarning("child-cleanup nudge activity failed", {
                parentThreadId: input.parentThreadId,
                cause: Cause.pretty(cause),
              }),
            ),
          );
        lastByParent.set(input.parentThreadId, {
          atMs: DateTime.toEpochMillis(DateTime.nowUnsafe()),
          nudgedCount: input.stats.count,
        });
      });

    const evaluateParent = (parentThreadId: string, projectId: ProjectId) =>
      Effect.gen(function* () {
        const childIds = yield* query.listChildThreadIdsByParent(
          ThreadId.make(parentThreadId),
          projectId,
        );
        const shells = (yield* Effect.all(childIds.map((id) => query.getThreadShellById(id))))
          .map(Option.getOrUndefined)
          .filter((shell): shell is NonNullable<typeof shell> => shell !== undefined);
        const nowMs = DateTime.toEpochMillis(DateTime.nowUnsafe());
        const stats = terminalUnsettledChildStats(shells, nowMs);
        const due = cleanupNudgeDue({
          count: stats.count,
          threshold: childCleanupNudgeAt(),
          cooldownMs: childCleanupNudgeCooldownMs(),
          nowMs,
          last: lastByParent.get(parentThreadId) ?? null,
        });
        if (!due) return;
        yield* emitNudge({ parentThreadId, projectId, stats });
      }).pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("child-cleanup nudge evaluation failed", {
            parentThreadId,
            cause: Cause.pretty(cause),
          }),
        ),
      );

    // Terminal-state transition of a child → evaluate its parent (if any;
    // workflow-owned children have no handoff parent and are skipped).
    const handleEvent = (event: OrchestrationEvent) => {
      if (event.type !== "thread.session-set") return Effect.void;
      if (sessionStatusToWaitOutcome(event.payload.session.status) === null) return Effect.void;
      const childThreadId = event.payload.threadId;
      return query.getThreadDetailById(childThreadId).pipe(
        Effect.flatMap((detailOption) => {
          const detail = Option.getOrUndefined(detailOption);
          if (detail === undefined) return Effect.void;
          const parentThreadId = findHandoffParentThreadId(detail.activities);
          if (parentThreadId === null) return Effect.void;
          return evaluateParent(parentThreadId, detail.projectId);
        }),
      );
    };

    const handleSafely = (event: OrchestrationEvent) =>
      handleEvent(event).pipe(
        Effect.catchCause((cause) => {
          if (Cause.hasInterruptsOnly(cause)) return Effect.failCause(cause);
          return Effect.logWarning("child-cleanup nudge reactor failed to process event", {
            eventType: event.type,
            cause: Cause.pretty(cause),
          });
        }),
      );

    yield* Effect.forkScoped(Stream.runForEach(engine.streamDomainEvents, handleSafely));

    // Rehydrate the dedup state, then the startup scan: every parent whose
    // terminal backlog crosses the threshold is nudged once (cooldown-aware),
    // so a restart never re-silent-izes a parent that already has one.
    const replayed: ReadonlyArray<OrchestrationEvent> = yield* Stream.runCollect(
      engine.readEvents(0, Number.MAX_SAFE_INTEGER),
    ).pipe(Effect.map((chunk) => Array.from(chunk)));
    for (const [parentThreadId, record] of collectLastCleanupNudges(replayed)) {
      lastByParent.set(parentThreadId, record);
    }
    const relations = yield* query.listParentChildRelations();
    const parentIds = new Set(relations.map((relation) => relation.parentThreadId as string));
    for (const parentThreadId of parentIds) {
      const parentShell = Option.getOrUndefined(
        yield* query
          .getThreadShellById(ThreadId.make(parentThreadId))
          .pipe(Effect.orElseSucceed(() => Option.none())),
      );
      if (parentShell === undefined || parentShell.archivedAt !== null) continue;
      yield* evaluateParent(parentThreadId, parentShell.projectId);
    }
  }),
);
