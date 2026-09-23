/**
 * Durable per-thread task journal — the plan an agent keeps OUTSIDE its context
 * window.
 *
 * The problem this table solves is measurable, not theoretical. One real 31-hour
 * nexplore orchestration run (thread `fbdb583b`) spent 128 turns across 22
 * compactions and 12 hard mid-conversation truncations. It recorded zero tasks,
 * because no such tool existed — and it issued 75 `t3team_children` polls, which
 * is what "re-derive your own plan by interrogating your children" looks like
 * when there is nowhere durable to put it. Rows here survive every compaction,
 * so the plan is READ BACK rather than reconstructed.
 *
 *   • `id` — host-minted row id, the primary key. Agents never supply it; the
 *     write path is whole-list replace (see
 *     `t3team-toolBrokerBindingTaskJournal.ts`), so ids are an internal handle,
 *     not something a weak model has to track across turns.
 *   • `thread_id` — the owning thread. The journal is strictly per-thread: a
 *     child session keeps its own, and nothing merges them. Not a foreign key,
 *     deliberately — the projection tables it would point at are rebuildable,
 *     and a rebuild must never cascade-delete a plan.
 *   • `position` — 1-based, dense, derived from the submitted array index. It is
 *     a stored column rather than a read-time `row_number()` so that ordering is
 *     a fact about the write, reproducible on any later read path.
 *   • `subject` / `active_form` — the imperative form ("Add the migration") and
 *     the optional present-participle form shown while the task runs ("Adding
 *     the migration"). `active_form` is nullable: a surface that has it renders
 *     a live status line, one that does not falls back to `subject`. It is
 *     carried now so the later web-UI phase needs no second migration.
 *   • `status` — `pending` / `in_progress` / `completed` / `cancelled`. Stored as
 *     TEXT rather than a CHECK constraint because the authoritative definition
 *     is the contract schema (`packages/contracts/src/t3team-taskRecord.ts`);
 *     duplicating it in DDL would create two places to drift.
 *   • `note` — the highest-value column. This is where the agent records WHY
 *     something failed, which approach is already ruled out, or what a child
 *     reported. That detail is exactly what compaction destroys first.
 *   • `created_at` / `updated_at` — ISO-8601 UTC, matching every other table
 *     here. Because the write path replaces the whole list, `created_at` is the
 *     instant of the write that produced the current row, not of the task's
 *     first appearance; nothing in this feature depends on task age.
 *
 * The `(thread_id, position)` index is the only read pattern: list one thread's
 * journal in order. It is intentionally NOT unique — a replace deletes then
 * inserts within one logical operation, and a unique index would make any future
 * non-atomic reordering fail mid-write rather than settle.
 */

import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE thread_task_records (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      subject TEXT NOT NULL,
      active_form TEXT,
      status TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE INDEX idx_thread_task_records_thread_position
    ON thread_task_records (thread_id, position)
  `;
});
