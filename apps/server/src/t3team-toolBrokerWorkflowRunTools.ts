/**
 * Live wiring for the agent-facing `t3team.orchestration.run` tool (ephemeral workflows, slice 1):
 * resolves the calling thread's project, enforces the ephemeral concurrency cap, persists an
 * inline `source` under `.t3team-runs/<runId>/workflow.ts` (the engine re-reads it on every
 * resume/rehydrate, so the file must outlive the call) or authorizes an existing `workflowPath`
 * ({@link ./t3team-workflowRunPathAuthorize.ts} — workspace containment, or a discovered pack
 * recipe's DECLARED workflow), then launches through the shared {@link launchPreparedWorkflow}
 * funnel with origin `ephemeral` — bound to the calling thread, NO approval gate.
 */
import type { ModelSelection, ProjectId, ThreadId } from "@t3tools/contracts";
import type { ProviderInteractionMode, RuntimeMode } from "@t3tools/contracts";
import type { RunWorkflowToolResult, WorkflowRunIntent } from "@t3team/sdk";
import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";

import { t3teamRandomUUID } from "./t3team-random.ts";
import {
  launchPreparedWorkflow,
  type PreparedWorkflowLaunchDeps,
} from "./t3team-workflowEphemeralLaunch.ts";
import { DEFAULT_EPHEMERAL_WORKFLOW_MAX_LIVE_RUNS } from "./t3team-workflowEphemeralConcurrencyPolicy.ts";
import { resolveRunWorkflowPath } from "./t3team-workflowRunPathAuthorize.ts";

/** Max ephemeral runs holding engine resources (running/suspended/sleeping) at once (spec D8). */
export const T3TEAM_EPHEMERAL_RUN_CAP = DEFAULT_EPHEMERAL_WORKFLOW_MAX_LIVE_RUNS;

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

export interface RunWorkflowHandlerArgs {
  readonly source?: string | undefined;
  readonly workflowPath?: string | undefined;
  readonly args?: unknown;
  readonly intent: WorkflowRunIntent;
}

export type T3TeamWorkflowRunToolHandlers = {
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
}): (threadId: ThreadId) => T3TeamWorkflowRunToolHandlers {
  const { fileSystem, path } = deps;

  return (threadId) => ({
    runWorkflow: (args) => {
      if (!fileSystem || !path) {
        return Effect.fail(
          "Filesystem services are not available for t3team.orchestration.run in this runtime.",
        );
      }
      return Effect.gen(function* () {
        const { project, thread } = yield* deps
          .loadThreadProject(threadId)
          .pipe(Effect.mapError(errorMessage));
        const workspaceRoot =
          typeof project.workspaceRoot === "string" && project.workspaceRoot.length > 0
            ? path.resolve(project.workspaceRoot)
            : yield* Effect.fail("Current t3team project has no workspace root.");
        const modelSelection = thread.modelSelection ?? project.defaultModelSelection;
        if (!modelSelection) {
          return yield* Effect.fail("Current t3team thread has no model selection to run with.");
        }

        const runId = t3teamRandomUUID();
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
