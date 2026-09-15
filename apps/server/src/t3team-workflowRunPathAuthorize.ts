/**
 * What `t3team.orchestration.run` is allowed to EXECUTE.
 *
 * Four rules, deliberately asymmetric:
 *  1. inline `source` → persisted at `.t3team-runs/<runId>/workflow.ts` (the engine re-reads it on
 *     every resume/rehydrate, so the file must outlive the call);
 *  2. a path inside the project workspace root → same containment rule, then SNAPSHOTTED into
 *     `.t3team-runs/<runId>/workflow.ts` (live incident: an agent authored its workflow as a
 *     project-root file and launched it by path. The run executed the file IN PLACE, so
 *     out-of-band edits drifted the journal, and the engine's self-heal + corrected-source
 *     resume — both keyed on `.t3team-runs/<runId>/` — were silently disabled for exactly the
 *     agent-authored runs they exist for. Snapshotting pins every agent launch to one source);
 *  3. a path inside a pack → authorized by recipe IDENTITY, never by directory
 *     ({@link ./t3team-workflowRunPackAuthorize.ts}); executed in place — pack code is shipped,
 *     self-heal must not rewrite it;
 *  4. whatever is executed is PRECHECKED ({@link precheckWorkflowSource}) before the launch is
 *     admitted. Live incident: an unparseable `.workflow.ts` was "accepted", then failed
 *     asynchronously at rehydration with a bare `SyntaxError` — the author saw no actionable
 *     feedback. Both the inline-`source` and every `workflowPath` branch fail synchronously
 *     with the reason + the authoring manual now.
 */
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { resolveWithinRoot } from "./t3team-projectRecipeDiscoveryShared.ts";
import { ensureEphemeralRunsGitignore } from "./t3team-workflowEphemeralSource.ts";
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
 * Persist an agent-authored source at `.t3team-runs/<runId>/workflow.ts`. The engine re-reads the
 * persisted path on every resume/rehydrate, so the file must outlive the call; snapshotting also
 * pins the run to its launch-time source (no replay drift from later out-of-band edits).
 */
const persistEphemeralWorkflowSource = (input: {
  readonly fileSystem: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly workspaceRoot: string;
  readonly runId: string;
  readonly content: string;
}): Effect.Effect<string, string> => {
  const { fileSystem, path, workspaceRoot, runId, content } = input;
  const runsRoot = path.join(workspaceRoot, ".t3team-runs");
  const runDirectory = path.join(runsRoot, runId);
  const workflowPath = path.join(runDirectory, "workflow.ts");
  return fileSystem.makeDirectory(runDirectory, { recursive: true }).pipe(
    // Self-ignoring `.t3team-runs/`: never fails the launch (`ensureEphemeralRunsGitignore`
    // swallows its own errors), never touches the user's own root `.gitignore`.
    Effect.andThen(
      ensureEphemeralRunsGitignore({ runsRoot }).pipe(
        Effect.provideService(FileSystem.FileSystem, fileSystem),
        Effect.provideService(Path.Path, path),
      ),
    ),
    Effect.andThen(fileSystem.writeFileString(workflowPath, content)),
    Effect.mapError(errorMessage),
    Effect.as(workflowPath),
  );
};

/**
 * Read an authorized workflow file and run it through the launch precheck, so an unparseable or
 * malformed source fails the tool call synchronously (reason + authoring manual) instead of
 * dying asynchronously at rehydration. Returns the source text.
 */
const readAndPrecheckSource = (input: {
  readonly fileSystem: FileSystem.FileSystem;
  readonly resolved: string;
}): Effect.Effect<string, string> =>
  input.fileSystem.readFileString(input.resolved).pipe(
    Effect.mapError(
      (error) => `Cannot read workflow source '${input.resolved}': ${errorMessage(error)}`,
    ),
    Effect.flatMap((content) => {
      const precheckError = precheckWorkflowSource(content);
      if (precheckError !== null) return Effect.fail(precheckError);
      return Effect.succeed(content);
    }),
  );

/**
 * Resolve what a `t3team.orchestration.run` call should execute, prechecked and pinned:
 * inline `source` is persisted at `.t3team-runs/<runId>/workflow.ts`; a workspace-local
 * `workflowPath` is authorized by containment (re-proved after the existence probe so a
 * symlink swap between acceptance and launch is caught), prechecked, then snapshotted to the
 * same `.t3team-runs/<runId>/workflow.ts` so the run is self-contained and self-healable;
 * a pack path runs only as a discovered recipe's declared workflow, in place, but prechecked.
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
    return persistEphemeralWorkflowSource({
      fileSystem,
      path,
      workspaceRoot,
      runId,
      content: source,
    });
  }

  const requestedPath = args.workflowPath?.trim() ?? "";
  const withinWorkspace = Effect.try({
    try: () => resolveWithinRoot(path, workspaceRoot, requestedPath),
    catch: (error) => `${errorMessage(error)} ${CONTAINMENT_HINT}`,
  });
  return Effect.gen(function* () {
    const contained = yield* withinWorkspace.pipe(Effect.result);
    if (contained._tag === "Success") {
      // Workspace-local (including `.t3team-runs/<runId>/workflow.ts`): containment re-proved
      // after the existence probe so a symlink swap between acceptance and launch is caught,
      // then the source is prechecked and snapshotted so the run is self-contained and
      // self-healable (the engine's repair + corrected-source resume both key on the
      // `.t3team-runs/<runId>/` snapshot).
      const resolved = yield* confirmRunnable({
        fileSystem,
        resolved: contained.success,
        reauthorize: () =>
          Effect.try({
            try: () => resolveWithinRoot(path, workspaceRoot, requestedPath) !== "",
            catch: () => "unauthorized",
          }).pipe(Effect.orElseSucceed(() => false)),
      });
      const content = yield* readAndPrecheckSource({ fileSystem, resolved });
      return yield* persistEphemeralWorkflowSource({
        fileSystem,
        path,
        workspaceRoot,
        runId,
        content,
      });
    }
    // Not workspace-local: the only remaining way in is BEING a discovered pack recipe's
    // workflow. Pack code executes in place (self-heal must not rewrite shipped code), but it
    // is still prechecked — a broken pack fails the launch synchronously with the same
    // actionable feedback instead of dying at rehydration.
    const packPath = yield* authorizePackWorkflow({
      fileSystem,
      path,
      workspaceRoot,
      requestedPath,
      containmentError: contained.failure,
    });
    yield* readAndPrecheckSource({ fileSystem, resolved: packPath });
    return packPath;
  });
}
