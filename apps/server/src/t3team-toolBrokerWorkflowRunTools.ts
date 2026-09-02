/**
 * Live wiring for the agent-facing `t3team.orchestration.run` tool (ephemeral workflows, slice 1):
 * resolves the calling thread's project, enforces the per-thread live-run cap
 * (`T3TEAM_EPHEMERAL_RUN_CAP`, below) plus — via the shared launch funnel's admission queue — the
 * step-concurrency cap, persists an inline `source` under `.t3team-runs/<runId>/workflow.ts` (must
 * outlive the call — the engine re-reads it on every resume/rehydrate) or authorizes an existing
 * `workflowPath` ({@link ./t3team-workflowRunPathAuthorize.ts}), then launches through the shared
 * {@link launchPreparedWorkflow} funnel with origin `ephemeral` — bound to the calling thread, NO
 * approval gate.
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
import {
  DEFAULT_EPHEMERAL_WORKFLOW_MAX_LIVE_RUNS,
  getWorkflowEphemeralConcurrencyPolicy,
} from "./t3team-workflowEphemeralConcurrencyPolicy.ts";
import { resolveRunWorkflowPath } from "./t3team-workflowRunPathAuthorize.ts";

/**
 * Compile-time SEED for the ephemeral run-count cap (spec D8) — the cap actually enforced below is
 * `getWorkflowEphemeralConcurrencyPolicy().maxLiveRuns`, since a CLI flag, env var, or pack policy
 * may have since changed it (same precedence as `maxActiveSteps`:
 * `resolveEphemeralWorkflowMaxLiveRunsOverride`, `cli/config.ts`).
 *
 * PER LAUNCHING THREAD (scoped via `countLiveByOrigin`'s `launchThreadId`), not server-wide: the
 * resource this protects — durable rows, registry entries, `.t3team-runs/` dirs piling up via
 * launch→suspend/sleep→pause — accumulates per CALLER, so a server-wide count would let one busy
 * thread starve every other thread's budget. Distinct from `maxActiveSteps`
 * (`t3team-workflowEphemeralConcurrencyPolicy.ts`): `sleeping` (Epic 27 `waitUntil`) and `paused`
 * runs release their step permit but keep their row + registry entry, so they still count here
 * even when the step-admission queue reports free capacity — neither needs special privilege
 * (`waitUntil` only needs a self-declared `"schedule"` capability; pause is reachable from the
 * calling thread for any run bound to it).
 */
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

        // Checked before any file/DB write (no orphaned `.t3team-runs/<runId>` dir on refusal),
        // scoped to THIS launching thread (see `T3TEAM_EPHEMERAL_RUN_CAP`'s doc comment for why).
        const maxLiveRuns = getWorkflowEphemeralConcurrencyPolicy().maxLiveRuns;
        const liveRunCapacity = maxLiveRuns === "unlimited" ? Number.POSITIVE_INFINITY : maxLiveRuns;
        const liveEphemeralRuns = yield* deps.launch.runRepository
          .countLiveByOrigin({ origin: "ephemeral", launchThreadId: threadId })
          .pipe(Effect.mapError(errorMessage));
        if (liveEphemeralRuns >= liveRunCapacity) {
          return yield* Effect.fail(
            `Too many live ephemeral workflow runs for this thread: ${liveEphemeralRuns} ` +
              "already running, suspended, sleeping, or paused, at or above this thread's cap " +
              `of ${maxLiveRuns}. Wait for one of THIS thread's runs to complete, fail, or be ` +
              "cancelled, then retry t3team.orchestration.run. (This limit is per launching " +
              "thread — other threads on this server are unaffected.)",
          );
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
