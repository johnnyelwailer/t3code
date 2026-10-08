/**
 * Mirrors a workflow `user.input` ask onto its thread record
 * (`thread.pendingWorkflowAsk`) so the V2 shell reports it as pending user
 * input (orchestration-v2/t3team-workflowAskShell.ts). The ask itself lives in
 * `workflow_runs`; the workflow host reconciles this mirror from there on every
 * run transition (t3team-workflowHostAskMirror.ts).
 *
 * Like the lineage writer: one locked `thread.metadata-updated` that keeps
 * `updatedAt`, so a waiting question does not reorder the sidebar or disturb
 * auto-settlement's snapshot check. A deleted or missing thread is skipped.
 *
 * Takes the thread lock itself; never call it while holding that lock.
 */
import type { OrchestrationV2PendingWorkflowAsk, ThreadId } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import * as EventSink from "../orchestration-v2/EventSink.ts";
import * as IdAllocator from "../orchestration-v2/IdAllocator.ts";
import * as ProjectionStore from "../orchestration-v2/ProjectionStore.ts";
import * as ThreadCommandExecutor from "../orchestration-v2/ThreadCommandExecutor.ts";
import { T3TeamV2WriterLayerLive } from "./t3team-v2Layers.ts";

export class T3TeamThreadWorkflowAskError extends Schema.TaggedError<T3TeamThreadWorkflowAskError>()(
  "T3TeamThreadWorkflowAskError",
  { threadId: Schema.String, cause: Schema.Defect() },
) {}

export class T3TeamThreadWorkflowAsk extends Context.Service<
  T3TeamThreadWorkflowAsk,
  {
    /** Sets (or, with `null`, clears) the mirror. Returns false when nothing changed. */
    readonly setPendingWorkflowAsk: (
      threadId: ThreadId,
      ask: OrchestrationV2PendingWorkflowAsk | null,
    ) => Effect.Effect<boolean, T3TeamThreadWorkflowAskError>;
  }
>()("t3/t3team-v2/t3team-threadWorkflowAsk/T3TeamThreadWorkflowAsk") {}

const isThreadNotFound = Schema.is(ProjectionStore.ProjectionStoreThreadNotFoundError);

const sameAsk = (
  a: OrchestrationV2PendingWorkflowAsk | null,
  b: OrchestrationV2PendingWorkflowAsk | null,
) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.runId === b.runId &&
    a.correlationId === b.correlationId &&
    a.createdAt === b.createdAt);

const make = Effect.gen(function* () {
  const locks = yield* ThreadCommandExecutor.ThreadCommandExecutor;
  const sink = yield* EventSink.EventSinkV2;
  const ids = yield* IdAllocator.IdAllocatorV2;
  const projections = yield* ProjectionStore.ProjectionStoreV2;

  const setLocked = (threadId: ThreadId, ask: OrchestrationV2PendingWorkflowAsk | null) =>
    Effect.gen(function* () {
      const thread = yield* projections.getThread(threadId);
      if (thread.deletedAt !== null) return false;
      if (sameAsk(thread.pendingWorkflowAsk ?? null, ask)) return false;
      yield* sink.write({
        events: [
          {
            id: yield* ids.allocate.event({ threadId }),
            type: "thread.metadata-updated",
            threadId,
            providerInstanceId: thread.providerInstanceId,
            occurredAt: yield* DateTime.now,
            payload: { ...thread, pendingWorkflowAsk: ask },
          },
        ],
      });
      return true;
    });

  return T3TeamThreadWorkflowAsk.of({
    setPendingWorkflowAsk: (threadId, ask) =>
      locks.withLock(threadId, setLocked(threadId, ask)).pipe(
        Effect.catchIf(isThreadNotFound, () => Effect.succeed(false)),
        Effect.mapError((cause) => new T3TeamThreadWorkflowAskError({ threadId, cause })),
        Effect.withSpan("t3team.threadWorkflowAsk.set"),
      ),
  });
});

/** Provides the writer over the runtime's shared lock and sink (by reference). */
export const layer = Layer.effect(T3TeamThreadWorkflowAsk, make).pipe(
  Layer.provide(T3TeamV2WriterLayerLive),
);
