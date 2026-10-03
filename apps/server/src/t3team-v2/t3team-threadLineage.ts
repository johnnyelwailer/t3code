/**
 * Lineage writes without a command (critic G9): links an existing thread to a
 * parent as a `subagent` (or `fork`) child. Used for children that do not come
 * from `delegated_task.request` — the V1 cutover pass, workflow children and
 * own-worktree children — so sidebars, cascades and sweepers read ONE relation
 * source: `shell.lineage`.
 *
 * Thread events are state-transfer upserts and every later mutation spreads
 * `...thread`, so one locked `thread.metadata-updated` persists the lineage.
 * `updatedAt` is kept unchanged so auto-settlement's snapshot check is not
 * disturbed. `forkedFrom` is left alone: a lineage-only child has no parent
 * subagent node, so V2's subagent-result recovery ignores it.
 *
 * Takes the thread lock itself; never call it while holding that lock.
 */
import type { OrchestrationV2AppThreadLineage, ThreadId } from "@t3tools/contracts";
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

export class T3TeamThreadLineageError extends Schema.TaggedError<T3TeamThreadLineageError>()(
  "T3TeamThreadLineageError",
  { threadId: Schema.String, cause: Schema.Defect() },
) {}

export interface SetThreadLineageInput {
  readonly threadId: ThreadId;
  readonly parentThreadId: ThreadId;
  readonly relationshipToParent: "subagent" | "fork";
}

export class T3TeamThreadLineage extends Context.Service<
  T3TeamThreadLineage,
  {
    /** Returns false when the thread already carried exactly this lineage. */
    readonly setThreadLineage: (
      input: SetThreadLineageInput,
    ) => Effect.Effect<boolean, T3TeamThreadLineageError>;
  }
>()("t3/t3team-v2/t3team-threadLineage/T3TeamThreadLineage") {}

const MAX_ANCESTOR_HOPS = 64;

const isLineageError = Schema.is(T3TeamThreadLineageError);
const lineageError = (input: SetThreadLineageInput, cause: string) =>
  new T3TeamThreadLineageError({ threadId: input.threadId, cause });

const sameLineage = (a: OrchestrationV2AppThreadLineage, b: OrchestrationV2AppThreadLineage) =>
  a.parentThreadId === b.parentThreadId &&
  a.relationshipToParent === b.relationshipToParent &&
  a.rootThreadId === b.rootThreadId;

const make = Effect.gen(function* () {
  const locks = yield* ThreadCommandExecutor.ThreadCommandExecutor;
  const sink = yield* EventSink.EventSinkV2;
  const ids = yield* IdAllocator.IdAllocatorV2;
  const projections = yield* ProjectionStore.ProjectionStoreV2;

  const setLocked = (input: SetThreadLineageInput) =>
    Effect.gen(function* () {
      if (input.threadId === input.parentThreadId) {
        return yield* lineageError(input, "a thread cannot be its own parent");
      }
      const parent = yield* projections.getThread(input.parentThreadId);
      // Refuse cycles: the new child must not already be one of the parent's ancestors.
      let ancestor = parent.lineage.parentThreadId;
      for (let hops = 0; ancestor !== null && hops < MAX_ANCESTOR_HOPS; hops += 1) {
        if (ancestor === input.threadId) {
          return yield* lineageError(input, "lineage would create a cycle");
        }
        ancestor = (yield* projections.getThread(ancestor)).lineage.parentThreadId;
      }
      const thread = yield* projections.getThread(input.threadId);
      if (thread.deletedAt !== null) return yield* lineageError(input, "thread is deleted");
      const lineage: OrchestrationV2AppThreadLineage = {
        parentThreadId: input.parentThreadId,
        relationshipToParent: input.relationshipToParent,
        rootThreadId: parent.lineage.rootThreadId,
      };
      if (sameLineage(thread.lineage, lineage)) return false;
      yield* sink.write({
        events: [
          {
            id: yield* ids.allocate.event({ threadId: input.threadId }),
            type: "thread.metadata-updated",
            threadId: input.threadId,
            providerInstanceId: thread.providerInstanceId,
            occurredAt: yield* DateTime.now,
            payload: { ...thread, lineage },
          },
        ],
      });
      return true;
    });

  return T3TeamThreadLineage.of({
    setThreadLineage: (input) =>
      locks.withLock(input.threadId, setLocked(input)).pipe(
        Effect.mapError((cause) =>
          isLineageError(cause)
            ? cause
            : new T3TeamThreadLineageError({ threadId: input.threadId, cause }),
        ),
        Effect.withSpan("t3team.threadLineage.set"),
      ),
  });
});

/** Provides the lineage writer over the runtime's shared lock and sink (by reference). */
export const layer = Layer.effect(T3TeamThreadLineage, make).pipe(
  Layer.provide(T3TeamV2WriterLayerLive),
);
