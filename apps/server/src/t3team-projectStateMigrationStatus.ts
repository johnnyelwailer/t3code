/**
 * The state of a handed-off state-dir migration, as the dialog polls it. Reads the record and, for
 * a run that ended without recording its outcome (failed, cancelled, or a launch lost to a
 * restart), settles the record from the run row so a poll never spins forever. No git, no copy.
 *
 * @module t3team-projectStateMigrationStatus
 */
import type { ProjectStateMigration } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { WorkflowRunRepository, type WorkflowRunStatus } from "./persistence/WorkflowRuns.ts";
import {
  isTerminalStateMigration,
  readStateMigrationRecord,
  updateStateMigrationRecord,
} from "./t3team-projectStateMigrationRecord.ts";

/** A `pending` record older than this lost its launch (a launch takes seconds). */
export const STATE_MIGRATION_STALE_PENDING_MS = 120_000;

type SettlingPatch = Pick<ProjectStateMigration, "status"> &
  Partial<Pick<ProjectStateMigration, "error">>;

/** How a non-terminal record settles given its run, or undefined while it is still live. */
export function settleStateMigration(input: {
  readonly record: ProjectStateMigration;
  readonly run:
    | {
        readonly status: WorkflowRunStatus;
        readonly failureReason?: string | null | undefined;
      }
    | undefined;
  readonly nowMs: number;
}): SettlingPatch | undefined {
  const { record, run } = input;
  if (isTerminalStateMigration(record)) return undefined;
  if (record.status === "pending") {
    const age = input.nowMs - Date.parse(record.updatedAt);
    return age > STATE_MIGRATION_STALE_PENDING_MS
      ? { status: "failed", error: "The migration thread was never launched." }
      : undefined;
  }
  if (run === undefined) return undefined;
  switch (run.status) {
    case "completed":
      return { status: "completed" };
    case "failed":
      return { status: "failed", error: run.failureReason ?? "The migration run failed." };
    case "cancelled":
      return { status: "failed", error: "The migration run was cancelled." };
    default:
      return undefined;
  }
}

/** The migration recorded under `workspaceRoot`, settled from its run when that run has ended. */
export const readStateMigrationStatus = Effect.fn("readStateMigrationStatus")(function* (
  workspaceRoot: string,
) {
  const record = yield* readStateMigrationRecord(workspaceRoot);
  if (record === undefined) return { migration: null };
  if (isTerminalStateMigration(record)) return { migration: record };
  const runs = yield* WorkflowRunRepository;
  const run =
    record.runId === undefined
      ? undefined
      : Option.getOrUndefined(
          yield* runs.getById({ runId: record.runId }).pipe(Effect.orElseSucceed(Option.none)),
        );
  const patch = settleStateMigration({
    record,
    run,
    nowMs: DateTime.toEpochMillis(yield* DateTime.now),
  });
  if (patch === undefined) return { migration: record };
  const settled = yield* updateStateMigrationRecord(record.toRoot, record.migrationId, patch);
  return { migration: settled ?? record };
});
