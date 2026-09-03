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
  /** Stop this still-active run (launched from the same thread) before launching the new one. */
  readonly replaceRunId?: string | undefined;
}

/** How recently a launch from the same thread blocks another one without `replaceRunId`. */
export const RECENT_LAUNCH_WINDOW_MS = 2 * 60_000;
const TERMINAL_RUN_STATUSES = new Set(["completed", "failed", "cancelled"]);

/**
 * GHE #415: one agent turn launched 87 runs in a loop because nothing enforced the manual's
 * "a successful handoff ends the turn". A second launch from the same thread while a run it
 * launched moments ago is still active is refused with the way out spelled out: observe it, or
 * pass `replaceRunId` to stop it and launch the replacement in one call.
 */
export function recentActiveLaunchBlocker(
  rows: ReadonlyArray<{
    readonly runId: string;
    readonly launchThreadId: string | null;
    readonly status: string;
    readonly createdAt: string;
  }>,
  input: {
    readonly threadId: string;
    readonly nowMs: number;
    readonly replaceRunId?: string | undefined;
  },
):
  | { readonly kind: "ok" }
  | { readonly kind: "replace"; readonly runId: string }
  | { readonly kind: "refuse"; readonly message: string } {
  const recent = rows.filter(
    (row) =>
      row.launchThreadId === input.threadId &&
      !TERMINAL_RUN_STATUSES.has(row.status) &&
      input.nowMs - Date.parse(row.createdAt) < RECENT_LAUNCH_WINDOW_MS,
  );
  if (recent.length === 0) return { kind: "ok" };
  if (input.replaceRunId !== undefined && recent.some((row) => row.runId === input.replaceRunId)) {
    return { kind: "replace", runId: input.replaceRunId };
  }
  const newest = recent[0]!;
  const ageSeconds = Math.max(0, Math.round((input.nowMs - Date.parse(newest.createdAt)) / 1000));
  return {
    kind: "refuse",
    message:
      `This thread launched orchestration run '${newest.runId}' ${ageSeconds}s ago and it is still ` +
      `${newest.status}. A successful launch ends your turn — do not launch another copy. ` +
      `Observe it with t3team_orchestration_status('${newest.runId}'); to replace it, call ` +
      `t3team_orchestration_run again with replaceRunId: '${newest.runId}' (the old run is stopped first); ` +
      `to change its inputs or source, use t3team_orchestration_resume('${newest.runId}', …).`,
  };
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
  /** Stops a run this thread launched (the card's Stop sequence); enables `replaceRunId`. */
  readonly stopRun?:
    | ((threadId: ThreadId, runId: string) => Effect.Effect<void, string>)
    | undefined;
  readonly nowMs?: (() => number) | undefined;
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

        // Arguments are valid; now the one launch-per-turn rule (GHE #415), before anything durable.
        const recentRows = yield* deps.launch.runRepository
          .listRecent({ limit: 25 })
          .pipe(Effect.mapError(errorMessage));
        const verdict = recentActiveLaunchBlocker(recentRows, {
          threadId: String(threadId),
          nowMs: (deps.nowMs ?? Date.now)(),
          replaceRunId: args.replaceRunId,
        });
        if (verdict.kind === "refuse") return yield* Effect.fail(verdict.message);
        if (verdict.kind === "replace") {
          if (deps.stopRun === undefined) {
            return yield* Effect.fail("replaceRunId is not supported in this runtime.");
          }
          yield* deps.stopRun(threadId, verdict.runId);
        }

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
