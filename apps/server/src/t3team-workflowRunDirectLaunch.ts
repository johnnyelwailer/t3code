/**
 * The `workflowPath` branch of `t3team.orchestration.run`: a saved recipe or workspace file, pinned
 * at `.t3team-runs/<runId>/workflow.ts` ({@link resolveRunWorkflowPath}), passed through the SAME
 * full check the author's submissions pass ({@link checkWorkflowSource}) and launched through the
 * shared funnel. Findings fail the call synchronously — a declared file has no author to fix it.
 */
import type { ModelSelection, ServerProvider, ThreadId } from "@t3tools/contracts";
import type { RunWorkflowToolResult } from "@t3team/sdk";
import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";

import {
  launchPreparedWorkflow,
  type PreparedWorkflowLaunchDeps,
  type PreparedWorkflowLaunchInput,
} from "./t3team-workflowEphemeralLaunch.ts";
import { resolveRunWorkflowPath } from "./t3team-workflowRunPathAuthorize.ts";
import { checkWorkflowSource, formatWorkflowSourceFindings } from "./t3team-workflowSourceCheck.ts";

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Resolve + pin + full-check a `workflowPath`; fails with the findings. */
export const prepareDirectWorkflowLaunch = Effect.fn("prepareDirectWorkflowLaunch")(
  function* (input: {
    readonly fileSystem: FileSystem.FileSystem;
    readonly path: Path.Path;
    readonly workspaceRoot: string;
    readonly runId: string;
    readonly workflowPath: string;
    readonly providers: ReadonlyArray<ServerProvider> | undefined;
    readonly baseModelSelection: ModelSelection;
  }) {
    const pinned = yield* resolveRunWorkflowPath({
      fileSystem: input.fileSystem,
      path: input.path,
      workspaceRoot: input.workspaceRoot,
      runId: input.runId,
      args: { workflowPath: input.workflowPath },
    });
    const source = yield* input.fileSystem
      .readFileString(pinned)
      .pipe(Effect.mapError(errorMessage));
    const verdict = checkWorkflowSource({
      source,
      absolutePath: pinned,
      providers: input.providers,
      baseModelSelection: input.baseModelSelection,
    });
    if (!verdict.ok) {
      return yield* Effect.fail(
        `Workflow '${input.workflowPath}' was not launched:\n${formatWorkflowSourceFindings(verdict.findings)}`,
      );
    }
    return pinned;
  },
);

/** Launch a prepared run detached from the tool call; returns once the run is durably admitted. */
export const launchDetachedWorkflow = Effect.fn("launchDetachedWorkflow")(function* (
  deps: PreparedWorkflowLaunchDeps,
  input: Omit<PreparedWorkflowLaunchInput, "onAdmitted"> & { readonly launchThreadId: ThreadId },
) {
  // Do not tie durable workflow execution to the MCP/HTTP request lifetime. A long timer or agent
  // turn can outlive that request by hours. The daemon owns lifecycle writes, registry parking,
  // scheduler wake-ups, and the same visible workflow card.
  let admittedResolve: (() => void) | undefined;
  let admittedReject: ((error: unknown) => void) | undefined;
  const admitted = new Promise<void>((resolve, reject) => {
    admittedResolve = resolve;
    admittedReject = reject;
  });
  const detached = launchPreparedWorkflow(deps, {
    ...input,
    onAdmitted: async () => admittedResolve?.(),
  }).pipe(Effect.tapError((error) => Effect.sync(() => admittedReject?.(error))));
  yield* detached.pipe(Effect.forkDetach({ startImmediately: true }));
  yield* Effect.promise(() => admitted).pipe(Effect.mapError(errorMessage));
  return {
    ok: true as const,
    runId: input.runId,
    status: "accepted" as const,
    handoff: "workflow-ui" as const,
  } satisfies RunWorkflowToolResult;
});
