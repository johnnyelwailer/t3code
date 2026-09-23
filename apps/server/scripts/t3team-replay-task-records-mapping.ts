/**
 * Pure mapping for the task-record replay script
 * (t3team-replay-task-records-to-plans.ts): journal row → plan step, plus the
 * tolerant payload read used for verification output.
 */
import * as Schema from "effect/Schema";

export type TaskRecordRow = {
  readonly threadId: string;
  readonly status: string;
  readonly subject: string;
};

export type PlanStep = {
  readonly step: string;
  readonly status: "pending" | "inProgress" | "completed";
};

export const PlanActivityPayloadJson = Schema.Struct({
  plan: Schema.optional(
    Schema.Array(Schema.Struct({ step: Schema.String, status: Schema.String })),
  ),
});

/** Tolerant read of a persisted `turn.plan.updated` payload for verification output. */
export const decodePlanActivityPayload = Schema.decodeEffect(
  Schema.fromJsonString(PlanActivityPayloadJson),
);

/** Same mapping the removed journal tool used: closed states read completed. */
export const toPlanStatus = (status: string): PlanStep["status"] =>
  status === "in_progress"
    ? "inProgress"
    : status === "completed" || status === "cancelled"
      ? "completed"
      : "pending";

/**
 * Group journal rows into per-thread plans, in `ORDER BY thread_id, position`
 * order (the caller's source query carries that ordering).
 */
export const toThreads = (source: readonly TaskRecordRow[]) => {
  const byThread = new Map<string, TaskRecordRow[]>();
  for (const row of source)
    byThread.set(row.threadId, [...(byThread.get(row.threadId) ?? []), row]);
  return [...byThread.entries()].map(([threadId, rows]) => ({
    threadId,
    plan: rows.map((row) => ({
      step: row.subject,
      status: toPlanStatus(row.status),
    })) as PlanStep[],
  }));
};

/** All ids here come from this database (UUIDs); quote-escape anyway. */
export const inList = (ids: readonly string[]): string =>
  ids.map((id) => `'${id.replaceAll("'", "''")}'`).join(", ");

export const READ_SOURCE = `
  SELECT thread_id AS "threadId", status AS "status", subject AS "subject"
  FROM thread_task_records ORDER BY thread_id, position
`;
