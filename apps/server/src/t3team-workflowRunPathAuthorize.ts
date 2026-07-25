/**
 * What `t3team.orchestration.run` is allowed to EXECUTE.
 *
 * Three cases, deliberately asymmetric:
 *  1. inline `source` → persisted at `.t3team-runs/<runId>/workflow.ts` (the engine re-reads it on
 *     every resume/rehydrate, so the file must outlive the call);
 *  2. a path inside the project workspace root → unchanged containment rule, so project-local and
 *     ephemeral runs behave exactly as before;
 *  3. a path inside a pack → authorized by recipe IDENTITY, never by directory
 *     ({@link ./t3team-workflowRunPackAuthorize.ts}).
 */
import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";

import { resolveWithinRoot } from "./t3team-projectRecipeDiscoveryShared.ts";
import {
  authorizePackWorkflow,
  confirmRunnable,
  CONTAINMENT_HINT,
} from "./t3team-workflowRunPackAuthorize.ts";
import { precheckWorkflowSource } from "./t3team-workflowSourcePrecheck.ts";

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

export interface RunWorkflowPathInput {
  readonly source?: string | undefined;
  readonly workflowPath?: string | undefined;
}

/**
 * Resolve what a `t3team.orchestration.run` call should execute. Inline `source` is persisted;
 * otherwise the requested path is authorized as workspace-local or as a discovered pack recipe's
 * declared workflow, and re-checked after the existence probe so a symlink swapped in between
 * acceptance and launch is caught.
 */
export function resolveRunWorkflowPath(input: {
  readonly fileSystem: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly workspaceRoot: string;
  readonly runId: string;
  readonly args: RunWorkflowPathInput;
}): Effect.Effect<string, string> {
  const { fileSystem, path, workspaceRoot, runId, args } = input;
  const source = args.source?.trim() ?? "";
  if (source.length > 0) {
    const precheckError = precheckWorkflowSource(source);
    if (precheckError !== null) {
      return Effect.fail(precheckError);
    }
    const runDirectory = path.join(workspaceRoot, ".t3team-runs", runId);
    const workflowPath = path.join(runDirectory, "workflow.ts");
    return fileSystem
      .makeDirectory(runDirectory, { recursive: true })
      .pipe(
        Effect.andThen(fileSystem.writeFileString(workflowPath, args.source ?? "")),
        Effect.mapError(errorMessage),
        Effect.as(workflowPath),
      );
  }

  const requestedPath = args.workflowPath?.trim() ?? "";
  const withinWorkspace = Effect.try({
    try: () => resolveWithinRoot(path, workspaceRoot, requestedPath),
    catch: (error) => `${errorMessage(error)} ${CONTAINMENT_HINT}`,
  });
  return Effect.gen(function* () {
    const contained = yield* withinWorkspace.pipe(Effect.result);
    if (contained._tag === "Success") {
      // Workspace-local (including `.t3team-runs/<runId>/workflow.ts`): unchanged rule, re-proved
      // after the existence probe so a symlink swap between acceptance and launch is caught.
      return yield* confirmRunnable({
        fileSystem,
        resolved: contained.success,
        reauthorize: () =>
          Effect.try({
            try: () => resolveWithinRoot(path, workspaceRoot, requestedPath) !== "",
            catch: () => "unauthorized",
          }).pipe(Effect.orElseSucceed(() => false)),
      });
    }
    // Not workspace-local: the only remaining way in is BEING a discovered pack recipe's workflow.
    return yield* authorizePackWorkflow({
      fileSystem,
      path,
      workspaceRoot,
      requestedPath,
      containmentError: contained.failure,
    });
  });
}
