/**
 * Delivery of a child-wait resolution (GHE #55): dispatch a `thread.actor.message`
 * from the child to the parent (the SAME channel `send_message` uses, which
 * drives the parent's agent to react — that is the "resume the parent's turn"
 * mechanism) plus a durable `t3team.child_wait.resolved` activity so
 * rehydration can see the wait is done. A dead child (session error) resolves
 * as `failed`, never silence. For abnormal outcomes the message carries the
 * same detail fragment as the standalone no-wait notification (GHE #157), so a
 * parent that DID register a wait still learns WHY the child died — in the
 * single resolution message, not a second one.
 *
 * @module t3team-childWaitResolve
 */
import {
  CommandId,
  EventId,
  MessageId,
  NonNegativeInt,
  ProjectId,
  ThreadId,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { type OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import { type ProjectionSnapshotQueryShape } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import { buildAbnormalStopDetail } from "./t3team-childAbnormalStopNotify.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";
import {
  CHILD_WAIT_RESOLVED_KIND,
  type ChildWaitOutcome,
  type ChildWaitRecord,
} from "./t3team-childWait.ts";
import { type ChildWaitIndex } from "./t3team-childWaitIndex.ts";

export interface ChildWaitResolveDeps {
  readonly engine: OrchestrationEngineShape;
  readonly query: ProjectionSnapshotQueryShape;
  readonly index: ChildWaitIndex;
  readonly rearm: () => Promise<void>;
}

export type ResolveWait = (
  record: ChildWaitRecord,
  outcome: ChildWaitOutcome,
) => Effect.Effect<void>;

export const makeResolveWait =
  (deps: ChildWaitResolveDeps): ResolveWait =>
  (record, outcome) =>
    Effect.gen(function* () {
      const outcomeLabel = outcome === "timeout" ? "timed out" : `reached ${outcome}`;
      const nowIso = DateTime.formatIso(DateTime.nowUnsafe());
      // The child's project (children always live in the parent's project) and
      // title, read fresh so the actor-message framing is correct.
      const child = Option.getOrUndefined(
        yield* deps.query
          .getThreadShellById(ThreadId.make(record.childThreadId))
          .pipe(Effect.orElseSucceed(() => Option.none())),
      );
      const fromProjectId = child ? child.projectId : ProjectId.make(record.parentThreadId);
      const fromTitle = child?.title ?? record.childTitle;
      // Abnormal outcomes fold the reason / last-known state into THIS message
      // (the dedup: a wait resolving for child+outcome means no standalone
      // abnormal-stop message is sent for the same stop).
      const detail =
        outcome === "failed" || outcome === "aborted"
          ? buildAbnormalStopDetail({
              lastError: child?.session?.lastError,
              childStatus: child?.childStatus,
            })
          : null;
      const text =
        `[Child wait ${outcomeLabel}] You were waiting (wait ${record.waitId}) on ` +
        `child «${fromTitle}» (thread ${record.childThreadId}); it ${outcomeLabel}.` +
        (detail ? ` ${detail}.` : "") +
        ` Continue with the result.`;
      yield* deps.engine
        .dispatch({
          type: "thread.actor.message",
          commandId: CommandId.make(`server:t3team:child-wait:${record.waitId}:msg`),
          threadId: ThreadId.make(record.parentThreadId),
          messageId: MessageId.make(t3teamRandomUUID()),
          fromThreadId: ThreadId.make(record.childThreadId),
          fromTitle,
          fromProjectId,
          text,
          urgency: "normal",
          hopCount: NonNegativeInt.make(0),
          rootThreadId: ThreadId.make(record.parentThreadId),
          createdAt: nowIso,
        })
        .pipe(
          Effect.catchCause((cause) =>
            Effect.logWarning("child-wait actor message failed", {
              waitId: record.waitId,
              cause: Cause.pretty(cause),
            }),
          ),
        );
      yield* deps.engine
        .dispatch({
          type: "thread.activity.append",
          commandId: CommandId.make(`server:t3team:child-wait:${record.waitId}:resolved`),
          threadId: ThreadId.make(record.parentThreadId),
          activity: {
            id: EventId.make(t3teamRandomUUID()),
            tone: "info",
            kind: CHILD_WAIT_RESOLVED_KIND,
            summary: `Child wait ${record.waitId} ${outcomeLabel}`,
            payload: { waitId: record.waitId, childThreadId: record.childThreadId, outcome },
            turnId: null,
            createdAt: nowIso,
          },
          createdAt: nowIso,
        })
        .pipe(
          Effect.catchCause((cause) =>
            Effect.logWarning("child-wait resolved activity failed", {
              waitId: record.waitId,
              cause: Cause.pretty(cause),
            }),
          ),
        );
      deps.index.remove(record.waitId);
      yield* Effect.promise(() => deps.rearm());
    });
