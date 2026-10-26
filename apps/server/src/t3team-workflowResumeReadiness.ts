import type { JournalStore } from "@t3team/sdk";
import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";

import type { WorkflowRun } from "./persistence/WorkflowRuns.ts";
import {
  AUTHORING_RECOVERY_HINT,
  workflowAuthoringRecovery,
} from "./t3team-workflowAuthorDraft.ts";

export interface WorkflowResumeRejected {
  readonly ok: false;
  readonly runId: string;
  readonly status: WorkflowRun["status"];
  readonly code: "WORKFLOW_NOT_STARTED" | "WORKFLOW_SOURCE_UNAVAILABLE";
  readonly state: {
    readonly journal: "missing" | "ready";
    readonly source: "missing" | "available" | "unavailable";
  };
  readonly failureReason?: string | undefined;
  readonly failureStep?: string | undefined;
  readonly authoring?: ReturnType<typeof workflowAuthoringRecovery>;
  readonly hint: string;
}

/** Admission is read-only: never mutate args/source or dispatch a replay without a journal. */
export const workflowResumeRejection = Effect.fn("workflowResumeRejection")(function* (
  deps: {
    readonly journalStore: JournalStore;
    readonly fileSystem?: FileSystem.FileSystem | undefined;
  },
  run: WorkflowRun,
  replacementSource?: string,
): Effect.fn.Return<WorkflowResumeRejected | undefined, string> {
  const hasJournal = yield* Effect.tryPromise({
    try: () => deps.journalStore.hasRun(run.runId),
    catch: (error) => `Cannot check workflow journal readiness: ${String(error)}`,
  });
  const source =
    deps.fileSystem === undefined
      ? ("unavailable" as const)
      : yield* deps.fileSystem.readFileString(run.workflowPath).pipe(
          Effect.map((text) => (text.trim() ? ("available" as const) : ("missing" as const))),
          Effect.catch((error) =>
            Effect.succeed(
              error.reason._tag === "NotFound" ? ("missing" as const) : ("unavailable" as const),
            ),
          ),
        );
  if (hasJournal && (source === "available" || replacementSource?.trim())) return undefined;
  return {
    ok: false,
    runId: run.runId,
    status: run.status,
    ...(run.failureReason ? { failureReason: run.failureReason } : {}),
    ...(run.failureStep ? { failureStep: run.failureStep } : {}),
    code: hasJournal ? "WORKFLOW_SOURCE_UNAVAILABLE" : "WORKFLOW_NOT_STARTED",
    state: { journal: hasJournal ? "ready" : "missing", source },
    ...(workflowAuthoringRecovery(run) === undefined
      ? {}
      : { authoring: workflowAuthoringRecovery(run) }),
    hint: hasJournal
      ? "The execution journal exists, but its source is unreadable or missing. Restore the source, then resume."
      : source === "available"
        ? "No execution journal exists. Re-launch the submitted workflow with t3_orchestration_run; journal resume cannot start it."
        : AUTHORING_RECOVERY_HINT,
  } satisfies WorkflowResumeRejected;
});
