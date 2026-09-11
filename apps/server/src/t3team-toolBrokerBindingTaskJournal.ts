import * as NodeCrypto from "node:crypto";

import { type TaskRecord, type ThreadId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import { type T3TeamToolCallResult } from "./t3team-toolBroker.ts";
import { errorResult, okResult } from "./t3team-toolBrokerHelpers.ts";
import {
  parseSubmittedTasks,
  presentTask,
  progressHint,
  TASK_LIST_TOOL_ID,
  TASK_WRITE_TOOL_ID,
} from "./t3team-toolBrokerBindingTaskJournalArgs.ts";

/**
 * `t3team.task.write` / `t3team.task.list` — the durable per-thread task
 * journal, i.e. the agent's own plan held OUTSIDE the context window so it
 * survives compaction. Argument parsing and presentation live in
 * `t3team-toolBrokerBindingTaskJournalArgs.ts`.
 *
 * WHOLE-LIST REPLACE is the deliberate write contract. The primary consumer is a
 * weak local model (qwen3.8 through the nexplore gateway), and re-sending the
 * complete list is something such a model does reliably, whereas id-based
 * partial patching is something it does not: it invents ids, reuses stale ones,
 * and silently drops rows it forgot to mention. Replace removes that entire
 * failure class — the list the agent sends IS the list, and position is simply
 * the array index.
 *
 * @module t3team-toolBrokerBindingTaskJournal
 */

export type TaskJournalStore = {
  readonly replaceForThread: (input: {
    readonly threadId: ThreadId;
    readonly tasks: ReadonlyArray<TaskRecord>;
  }) => Effect.Effect<void, string>;
  readonly listForThread: (input: {
    readonly threadId: ThreadId;
  }) => Effect.Effect<ReadonlyArray<TaskRecord>, string>;
};

export function isT3TeamTaskJournalTool(tool: string): boolean {
  return tool === TASK_WRITE_TOOL_ID || tool === TASK_LIST_TOOL_ID;
}

export function callT3TeamTaskJournalTool(input: {
  readonly tool: string;
  readonly scopeLabel: string;
  readonly toolArgs: unknown;
  readonly threadId?: ThreadId | undefined;
  readonly store?: TaskJournalStore | undefined;
  /** Injected for tests; defaults to the wall clock. */
  readonly now?: (() => string) | undefined;
  /** Injected for tests; defaults to `crypto.randomUUID`. */
  readonly makeId?: (() => string) | undefined;
}): Effect.Effect<T3TeamToolCallResult, never> {
  const { tool, toolArgs, threadId, store } = input;
  if (!threadId || !store || !isT3TeamTaskJournalTool(tool)) {
    return Effect.succeed(errorResult(`Tool '${tool}' is not enabled ${input.scopeLabel}.`));
  }

  if (tool === TASK_LIST_TOOL_ID) {
    return Effect.gen(function* () {
      const read = yield* store.listForThread({ threadId }).pipe(Effect.result);
      if (read._tag === "Failure") {
        return errorResult(`Could not read this thread's task list: ${read.failure}`);
      }
      const tasks = read.success;
      return okResult({
        ok: true,
        tasks: tasks.map(presentTask),
        ...(tasks.length === 0
          ? {
              hint:
                `No tasks recorded for this thread yet. Call ${TASK_WRITE_TOOL_ID} with your ` +
                `plan so it survives context compaction.`,
            }
          : {}),
      });
    });
  }

  const parsed = parseSubmittedTasks(toolArgs);
  if ("error" in parsed) {
    return Effect.succeed(errorResult(parsed.error));
  }

  const makeId = input.makeId ?? (() => NodeCrypto.randomUUID());

  return Effect.gen(function* () {
    // The clock is read through Effect's DateTime rather than `new Date()` so a
    // test can drive it deterministically; `now` stays injectable for the same
    // reason. One timestamp for the whole list — the write is one logical event.
    const timestamp = input.now ? input.now() : DateTime.formatIso(yield* DateTime.now);
    const records: ReadonlyArray<TaskRecord> = parsed.tasks.map((task, index) => ({
      id: makeId(),
      threadId,
      // 1-based and derived from the array index: the order the agent sent IS
      // the order, so there is no separate ordering field to keep consistent.
      position: index + 1,
      subject: task.subject,
      ...(task.activeForm ? { activeForm: task.activeForm } : {}),
      status: task.status,
      ...(task.note ? { note: task.note } : {}),
      createdAt: timestamp,
      updatedAt: timestamp,
    }));

    const write = yield* store.replaceForThread({ threadId, tasks: records }).pipe(Effect.result);
    if (write._tag === "Failure") {
      return errorResult(`Could not save this thread's task list: ${write.failure}`);
    }
    const hint = progressHint(parsed.tasks);
    return okResult({
      ok: true,
      tasks: records.map(presentTask),
      ...(hint ? { hint } : {}),
    });
  });
}
