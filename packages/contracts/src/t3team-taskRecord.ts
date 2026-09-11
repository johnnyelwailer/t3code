/**
 * TaskRecord — the durable, per-thread task journal.
 *
 * WHY this exists at all: an agent's plan currently lives only in its context
 * window, so every compaction and every hard truncation destroys it. Measured on
 * one real 31-hour orchestration run (thread `fbdb583b`): 128 turns, 22
 * compactions, 12 mid-conversation truncations, and — because no durable plan
 * existed — 75 `t3team_children` polls, the orchestrator re-deriving its own
 * state by interrogating its children over and over. A journal row survives all
 * of that, so the plan is read back instead of reconstructed.
 *
 * WHY the name is `TaskRecord` and not `Todo`: `todo` is already taken in this
 * repo by the Claude / OpenCode vendor adapters' own tool
 * (`apps/server/src/provider/Layers/ClaudeAdapter.ts`,
 * `OpenCodeAdapter.ts`). `TaskRecord` is the neutral, host-owned concept that
 * spans every provider, exactly as `ChangeRequest` is the neutral term for a
 * pull/merge request.
 *
 * @module taskRecord
 */
import * as Schema from "effect/Schema";

import { IsoDateTime, ThreadId } from "./baseSchemas.ts";

/**
 * Task lifecycle. Deliberately four states and no more — the consumer is a weak
 * local model (qwen3.8 through the nexplore gateway), and every extra state is
 * another way for it to mislabel a row. `cancelled` is kept distinct from
 * `completed` because "we decided not to do this" is exactly the kind of
 * decision compaction erases and an agent then silently redoes.
 */
export const TaskRecordStatus = Schema.Literals([
  "pending",
  "in_progress",
  "completed",
  "cancelled",
]);
export type TaskRecordStatus = typeof TaskRecordStatus.Type;

export const TaskRecord = Schema.Struct({
  /** Stable row id. Assigned by the host on write; agents never mint it. */
  id: Schema.String,
  /** The thread this journal belongs to. The journal is strictly per-thread: a
   * child session keeps its own plan, and nothing merges them. */
  threadId: ThreadId,
  /** 1-based display/execution order, dense and gap-free. It is derived from the
   * submitted array index rather than stored by the agent, because whole-list
   * replace is the only write path (see the broker binding) and a weak model
   * cannot be trusted to keep a separate ordering field consistent. */
  position: Schema.Number,
  /** The imperative form — "Add the migration". This is the task's identity. */
  subject: Schema.String,
  /** The present-participle form shown while the task runs — "Adding the
   * migration". Optional: a UI that has it can render a live status line, and a
   * UI that does not falls back to `subject`. Kept in the contract now so the
   * later web-UI phase does not need a second migration. */
  activeForm: Schema.optional(Schema.String),
  status: TaskRecordStatus,
  /** Free text — and the highest-value column here. This is where the agent
   * records WHY something failed, which approach was already ruled out, or what
   * a child reported back. That detail is precisely what compaction destroys
   * first, and re-deriving it is what the 75 redundant child polls were. */
  note: Schema.optional(Schema.String),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type TaskRecord = typeof TaskRecord.Type;
