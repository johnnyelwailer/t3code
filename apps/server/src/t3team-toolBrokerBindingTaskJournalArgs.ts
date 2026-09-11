import { type TaskRecord, type TaskRecordStatus } from "@t3tools/contracts";

/**
 * Argument parsing, validation and agent-facing presentation for the task
 * journal (`t3team.task.write` / `t3team.task.list`). Split out of
 * `t3team-toolBrokerBindingTaskJournal.ts`, which keeps the dispatch and the
 * record building, so both stay under the prefixed-file LOC cap.
 *
 * Every rejection message names the tool AND the offending index on purpose:
 * the caller is typically a weak local model, and "invalid arguments" makes it
 * retry the identical shape, while "tasks[1] has an unknown 'status'" makes it
 * fix the one field.
 *
 * @module t3team-toolBrokerBindingTaskJournalArgs
 */

export const TASK_WRITE_TOOL_ID = "t3team.task.write";
export const TASK_LIST_TOOL_ID = "t3team.task.list";

const TASK_STATUSES: ReadonlyArray<TaskRecordStatus> = [
  "pending",
  "in_progress",
  "completed",
  "cancelled",
];

/** Upper bound on one journal. Not a storage limit — a legibility one: a plan a
 * model cannot hold in one glance is a plan it will stop maintaining. */
const MAX_TASKS = 100;

type SubmittedTask = {
  readonly subject?: unknown;
  readonly status?: unknown;
  readonly activeForm?: unknown;
  readonly active_form?: unknown;
  readonly note?: unknown;
};

export type ParsedTask = {
  readonly subject: string;
  readonly status: TaskRecordStatus;
  readonly activeForm?: string | undefined;
  readonly note?: string | undefined;
};

function readOptionalText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

/**
 * The agent-facing projection of a stored task. `position` leads because it is
 * what the agent refers to in prose; the row id is omitted entirely, so a weak
 * model is never tempted to patch by id — which this tool does not support.
 */
export function presentTask(task: TaskRecord) {
  return {
    position: task.position,
    subject: task.subject,
    status: task.status,
    ...(task.activeForm ? { active_form: task.activeForm } : {}),
    ...(task.note ? { note: task.note } : {}),
    updated_at: task.updatedAt,
  };
}

export function parseSubmittedTasks(
  toolArgs: unknown,
): { readonly error: string } | { readonly tasks: ReadonlyArray<ParsedTask> } {
  const args = (toolArgs ?? {}) as { readonly tasks?: unknown };
  const raw = args.tasks;
  if (!globalThis.Array.isArray(raw)) {
    return {
      error:
        `${TASK_WRITE_TOOL_ID} requires a 'tasks' ARRAY holding the complete task list. ` +
        `This tool replaces the whole list every time, so send every task you still care ` +
        `about, not just the one that changed.`,
    };
  }
  if (raw.length > MAX_TASKS) {
    return {
      error: `${TASK_WRITE_TOOL_ID} accepts at most ${MAX_TASKS} tasks (got ${raw.length}).`,
    };
  }

  const tasks: ParsedTask[] = [];
  for (const [index, entry] of raw.entries()) {
    if (!entry || typeof entry !== "object" || globalThis.Array.isArray(entry)) {
      return {
        error: `${TASK_WRITE_TOOL_ID}: tasks[${index}] must be an object with a 'subject'.`,
      };
    }
    const submitted = entry as SubmittedTask;
    const subject = readOptionalText(submitted.subject);
    if (!subject) {
      return {
        error: `${TASK_WRITE_TOOL_ID}: tasks[${index}] requires a non-empty 'subject' string.`,
      };
    }
    let status: TaskRecordStatus = "pending";
    if (submitted.status !== undefined) {
      const candidate = submitted.status;
      if (typeof candidate !== "string" || !TASK_STATUSES.includes(candidate as TaskRecordStatus)) {
        return {
          error:
            `${TASK_WRITE_TOOL_ID}: tasks[${index}] has an unknown 'status'. ` +
            `Use one of: ${TASK_STATUSES.join(", ")}.`,
        };
      }
      status = candidate as TaskRecordStatus;
    }
    // `active_form` is accepted alongside `activeForm`: the MCP surface is
    // snake_case throughout, and a model that has seen both spellings should not
    // lose the field to a naming accident.
    const activeForm = readOptionalText(submitted.activeForm ?? submitted.active_form);
    const note = readOptionalText(submitted.note);
    tasks.push({
      subject,
      status,
      ...(activeForm ? { activeForm } : {}),
      ...(note ? { note } : {}),
    });
  }
  return { tasks };
}

/**
 * A nudge, never a rejection. Refusing to store an imperfect plan is strictly
 * worse than storing it — the plan is the thing being protected — but a returned
 * hint is the lever that actually moves a weak model's next write.
 */
export function progressHint(tasks: ReadonlyArray<ParsedTask>): string | undefined {
  const active = tasks.filter((task) => task.status === "in_progress").length;
  if (active > 1) {
    return (
      `${active} tasks are marked in_progress. Keep exactly one in_progress at a time so the ` +
      `plan says what you are doing right now.`
    );
  }
  if (active === 0 && tasks.some((task) => task.status === "pending")) {
    return "No task is in_progress. Mark the one you are working on in_progress on your next write.";
  }
  return undefined;
}
