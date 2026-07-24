/**
 * Live wiring for the agent-facing `t3work.orchestration.run` tool (ephemeral workflows, slice 1):
 * resolves the calling thread's project, enforces the ephemeral concurrency cap, persists an
 * inline `source` under `.t3work-runs/<runId>/workflow.ts` (the engine re-reads it on every
 * resume/rehydrate, so the file must outlive the call) or containment-checks `workflowPath`,
 * then launches through the shared {@link launchPreparedWorkflow} funnel with origin
 * `ephemeral` — bound to the calling thread, NO approval gate.
 */
import type { ModelSelection, ProjectId, ThreadId } from "@t3tools/contracts";
import type { ProviderInteractionMode, RuntimeMode } from "@t3tools/contracts";
import type { RunWorkflowToolResult, WorkflowRunIntent } from "@t3work/sdk";
import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";

import { resolveWithinRoot } from "./t3work-projectRecipeDiscoveryShared.ts";
import { t3workRandomUUID } from "./t3work-random.ts";
import {
  launchPreparedWorkflow,
  type PreparedWorkflowLaunchDeps,
} from "./t3work-workflowEphemeralLaunch.ts";
import { DEFAULT_EPHEMERAL_WORKFLOW_MAX_LIVE_RUNS } from "./t3work-workflowEphemeralConcurrencyPolicy.ts";
import { precheckWorkflowSource } from "./t3work-workflowSourcePrecheck.ts";

/** Max ephemeral runs holding engine resources (running/suspended/sleeping) at once (spec D8). */
export const T3WORK_EPHEMERAL_RUN_CAP = DEFAULT_EPHEMERAL_WORKFLOW_MAX_LIVE_RUNS;

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

export interface RunWorkflowHandlerArgs {
  readonly source?: string | undefined;
  readonly workflowPath?: string | undefined;
  readonly args?: unknown;
  readonly intent: WorkflowRunIntent;
}

export type T3workWorkflowRunToolHandlers = {
  readonly runWorkflow: (
    args: RunWorkflowHandlerArgs,
  ) => Effect.Effect<RunWorkflowToolResult, string>;
};

type LoadThreadProject<E> = (threadId: ThreadId) => Effect.Effect<
  {
    readonly project: {
      readonly workspaceRoot: string | null | undefined;
      readonly defaultModelSelection?: ModelSelection | null | undefined;
    };
    readonly thread: {
      readonly projectId: ProjectId;
      readonly runtimeMode: RuntimeMode;
      readonly interactionMode: ProviderInteractionMode;
      readonly modelSelection?: ModelSelection | null | undefined;
    };
  },
  E
>;

export function makeWorkflowRunToolHandlers<E>(deps: {
  readonly fileSystem?: FileSystem.FileSystem | undefined;
  readonly path?: Path.Path | undefined;
  readonly launch: Omit<PreparedWorkflowLaunchDeps, "fileSystem" | "path">;
  readonly loadThreadProject: LoadThreadProject<E>;
}): (threadId: ThreadId) => T3workWorkflowRunToolHandlers {
  const { fileSystem, path } = deps;

  return (threadId) => ({
    runWorkflow: (args) => {
      if (!fileSystem || !path) {
        return Effect.fail(
          "Filesystem services are not available for t3work.orchestration.run in this runtime.",
        );
      }
      return Effect.gen(function* () {
        const { project, thread } = yield* deps
          .loadThreadProject(threadId)
          .pipe(Effect.mapError(errorMessage));
        const workspaceRoot =
          typeof project.workspaceRoot === "string" && project.workspaceRoot.length > 0
            ? path.resolve(project.workspaceRoot)
            : yield* Effect.fail("Current t3work project has no workspace root.");
        const modelSelection = thread.modelSelection ?? project.defaultModelSelection;
        if (!modelSelection) {
          return yield* Effect.fail("Current t3work thread has no model selection to run with.");
        }

        const runId = t3workRandomUUID();
        const workflowPath = yield* resolveRunWorkflowPath({
          fileSystem,
          path,
          workspaceRoot,
          runId,
          args,
        });

        // Do not tie durable workflow execution to the MCP/HTTP request lifetime. A long timer
        // or agent turn can outlive that request by hours. The daemon owns lifecycle writes,
        // registry parking, scheduler wake-ups, and the same visible workflow card.
        let admittedResolve: (() => void) | undefined;
        let admittedReject: ((error: unknown) => void) | undefined;
        const admitted = new Promise<void>((resolve, reject) => {
          admittedResolve = resolve;
          admittedReject = reject;
        });
        const detached = launchPreparedWorkflow(
          { ...deps.launch, fileSystem, path },
          {
            runId,
            workflowPath,
            args: args.args ?? {},
            intent: args.intent,
            workspaceRoot,
            launchThreadId: threadId,
            projectId: thread.projectId,
            modelSelection,
            runtimeMode: thread.runtimeMode,
            interactionMode: thread.interactionMode,
            origin: "ephemeral",
            onAdmitted: async () => admittedResolve?.(),
          },
        ).pipe(Effect.tapError((error) => Effect.sync(() => admittedReject?.(error))));
        yield* detached.pipe(Effect.forkDetach({ startImmediately: true }));
        yield* Effect.promise(() => admitted).pipe(Effect.mapError(errorMessage));

        return {
          ok: true as const,
          runId,
          status: "accepted" as const,
          handoff: "workflow-ui" as const,
        } satisfies RunWorkflowToolResult;
      });
    },
  });
}

/** Persist inline `source` under `.t3work-runs/<runId>/workflow.ts`, or containment-check an
 * existing `workflowPath` against the workspace root (same rule as `t3work.recipe.validate`). */
function resolveRunWorkflowPath(input: {
  readonly fileSystem: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly workspaceRoot: string;
  readonly runId: string;
  readonly args: RunWorkflowHandlerArgs;
}): Effect.Effect<string, string> {
  const { fileSystem, path, workspaceRoot, runId, args } = input;
  const source = args.source?.trim() ?? "";
  if (source.length > 0) {
    const precheckError = precheckWorkflowSource(source);
    if (precheckError !== null) {
      return Effect.fail(precheckError);
    }
    const runDirectory = path.join(workspaceRoot, ".t3work-runs", runId);
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
  return Effect.try({
    try: () => resolveWithinRoot(path, workspaceRoot, requestedPath),
    catch: (error) => `${errorMessage(error)} Paths must stay inside the project workspace root.`,
  }).pipe(
    Effect.flatMap((resolved) =>
      fileSystem.exists(resolved).pipe(
        Effect.mapError(errorMessage),
        Effect.flatMap((exists) =>
          exists
            ? Effect.succeed(resolved)
            : Effect.fail(`Workflow path does not exist: ${resolved}`),
        ),
      ),
    ),
  );
}
