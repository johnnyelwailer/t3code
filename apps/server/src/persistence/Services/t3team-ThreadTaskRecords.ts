/**
 * ThreadTaskRecordRepository — persistence for the durable per-thread task
 * journal (`thread_task_records`). See
 * `../Migrations/t3team-056_ThreadTaskRecords.ts` for why the table exists.
 *
 * The shape is deliberately two operations and no more. There is no `update`,
 * no `patch`, no `delete-one`: the only writer is
 * `t3team.task.write`, whose contract is WHOLE-LIST REPLACE. That is a design
 * decision about the consumer, not a shortcut — the primary caller is a weak
 * local model (qwen3.8 via the nexplore gateway), which re-sends a full list far
 * more reliably than it patches by id. Adding a partial-update path here would
 * immediately re-introduce the id-tracking burden the replace semantics exist to
 * remove.
 *
 * @module ThreadTaskRecordRepository
 */
import { TaskRecord, ThreadId } from "@t3tools/contracts";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import type { ProjectionRepositoryError } from "../Errors.ts";

export { TaskRecord };

/** The full journal for one thread, in `position` order, as it is written. */
export const ReplaceThreadTaskRecordsInput = Schema.Struct({
  threadId: ThreadId,
  tasks: Schema.Array(TaskRecord),
});
export type ReplaceThreadTaskRecordsInput = typeof ReplaceThreadTaskRecordsInput.Type;

export const ListThreadTaskRecordsInput = Schema.Struct({ threadId: ThreadId });
export type ListThreadTaskRecordsInput = typeof ListThreadTaskRecordsInput.Type;

export interface ThreadTaskRecordRepositoryShape {
  /**
   * Replace this thread's ENTIRE journal with `tasks`, atomically: the previous
   * rows are deleted and the new ones inserted in the same transaction, so a
   * concurrent read never observes a half-written plan (an empty journal read
   * mid-write would look exactly like "the agent has no plan", which is the one
   * state this feature exists to prevent). An empty `tasks` array is a legal
   * write and means "the plan is now empty".
   */
  readonly replaceForThread: (
    input: ReplaceThreadTaskRecordsInput,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
  /**
   * Read this thread's journal in `position` order. A thread that has never
   * written one yields an empty array — absence of a plan is a normal state, not
   * an error, and the tool surface must be able to say "you have no tasks yet".
   */
  readonly listForThread: (
    input: ListThreadTaskRecordsInput,
  ) => Effect.Effect<ReadonlyArray<TaskRecord>, ProjectionRepositoryError>;
}

/** ThreadTaskRecordRepository - service tag for durable task-journal persistence. */
export class ThreadTaskRecordRepository extends Context.Service<
  ThreadTaskRecordRepository,
  ThreadTaskRecordRepositoryShape
>()("t3/persistence/Services/t3team-ThreadTaskRecords/ThreadTaskRecordRepository") {}
