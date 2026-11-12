import { writeFileStringAtomically } from "@t3tools/shared/atomicWrite";
import { ensureEphemeralRunsGitignore } from "./t3team-workflowEphemeralSource.ts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import type { WorkflowRun } from "./persistence/WorkflowRuns.ts";

export const AUTHORING_EXHAUSTED_STEP = "authoring.exhausted";
const workflowAuthorDraftPath = (workflowPath: string) => `${workflowPath}.draft.json`;

/** A source candidate is never the executable workflow.ts until submission passes validation. */
export function makeWorkflowAuthorDraft(input: {
  readonly workflowPath: string;
  readonly fileSystem: FileSystem.FileSystem;
  readonly path: Path.Path;
}) {
  let draft: { source?: string; reply?: string } = {};
  return async (update: typeof draft) => {
    draft = { ...draft, ...update };
    const target = workflowAuthorDraftPath(input.workflowPath);
    await Effect.runPromise(
      ensureEphemeralRunsGitignore({
        runsRoot: input.path.dirname(input.path.dirname(target)),
      }).pipe(
        Effect.andThen(
          writeFileStringAtomically({ filePath: target, contents: JSON.stringify(draft) }),
        ),
        Effect.provideService(FileSystem.FileSystem, input.fileSystem),
        Effect.provideService(Path.Path, input.path),
      ),
    );
    return Boolean(draft.source?.trim() || draft.reply?.trim());
  };
}

export function workflowAuthoringRecovery(row: WorkflowRun) {
  if (
    row.failureStep !== AUTHORING_EXHAUSTED_STEP &&
    row.failureStep !== `${AUTHORING_EXHAUSTED_STEP}.empty`
  )
    return undefined;
  return {
    state:
      row.failureStep === AUTHORING_EXHAUSTED_STEP
        ? ("exhausted_with_draft" as const)
        : ("exhausted" as const),
    draftPath: workflowAuthorDraftPath(row.workflowPath),
    action: "re-author" as const,
    replaceRunId: row.runId,
  };
}

export const AUTHORING_RECOVERY_HINT =
  "Execution has not started. Re-author with t3_orchestration_run using the original intent, " +
  "the retained draft if available, and replaceRunId for this run; journal resume cannot start it.";
