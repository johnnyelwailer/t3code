/**
 * Live wiring for the agent-facing `t3team.orchestration.run` tool. Three callers, three branches:
 *   • a thread that OWNS an author session — the call is that author's source submission
 *     ({@link submitAuthoredWorkflowSource}); the run id and intent are already bound;
 *   • `workflowPath` — a saved recipe / workspace file, pinned, full-checked and launched directly
 *     ({@link ./t3team-workflowRunDirectLaunch.ts});
 *   • everything else — `intent` (+ optional draft `source`) hands the run to the hidden author
 *     agent ({@link startAuthoredWorkflowRun}); the call returns `status: "authoring"` as soon as
 *     the run row, its card and its "Authoring" step exist, and the caller ends its turn.
 * The parent never needs authoring knowledge: every fixable error stays inside the author's tool
 * loop, and only an unfixable outcome reaches the launch thread, once, as the run's failure notice.
 */
import type { ModelSelection, ProjectId, ServerProvider, ThreadId } from "@t3tools/contracts";
import type { ProviderInteractionMode, RuntimeMode } from "@t3tools/contracts";
import type { RunWorkflowToolResult, WorkflowRunIntent } from "@t3team/sdk";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";

import { threadCheckoutRoot } from "./t3team-threadCheckoutRoot.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";
import type { T3TeamThreadToolContextStoreShape } from "./t3team-threadToolContextStore.ts";
import { startAuthoredWorkflowRun } from "./t3team-workflowAuthorLaunch.ts";
import { resolveWorkflowAuthorModel } from "./t3team-workflowAuthorModel.ts";
import { workflowAuthorSessionForThread } from "./t3team-workflowAuthorSession.ts";
import { submitAuthoredWorkflowSource } from "./t3team-workflowAuthorSubmit.ts";
import type { PreparedWorkflowLaunchDeps } from "./t3team-workflowEphemeralLaunch.ts";
import { launchDetachedWorkflow } from "./t3team-workflowRunDirectLaunch.ts";
import { resolveRunTarget } from "./t3team-toolBrokerWorkflowRunTarget.ts";
import { recentActiveLaunchBlocker } from "./t3team-workflowRunLaunchBlocker.ts";
import * as RecipeRun from "./t3team-toolBrokerWorkflowRunRecipe.ts";

export { recentActiveLaunchBlocker } from "./t3team-workflowRunLaunchBlocker.ts";

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));
const nowIso = () => DateTime.formatIso(DateTime.nowUnsafe());

export interface RunWorkflowHandlerArgs {
  readonly source?: string | undefined;
  readonly workflowPath?: string | undefined;
  readonly recipe?: string | undefined;
  readonly action?: string | undefined;
  readonly args?: unknown;
  readonly intent: WorkflowRunIntent;
  /** Stop this still-active run (launched from the same thread) before launching the new one. */
  readonly replaceRunId?: string | undefined;
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
      readonly worktreePath?: string | null | undefined;
    };
  },
  E
>;

export interface WorkflowRunToolDeps<E> {
  readonly fileSystem?: FileSystem.FileSystem | undefined;
  readonly path?: Path.Path | undefined;
  readonly launch: Omit<PreparedWorkflowLaunchDeps, "fileSystem" | "path">;
  readonly loadThreadProject: LoadThreadProject<E>;
  /** Stops a run this thread launched (the card's Stop sequence); enables `replaceRunId`. */
  readonly stopRun?:
    | ((threadId: ThreadId, runId: string) => Effect.Effect<void, string>)
    | undefined;
  /** Live provider snapshots: the author's model choice and the source check's model gate. */
  readonly listProviders?: (() => Effect.Effect<ReadonlyArray<ServerProvider>>) | undefined;
  /** Scopes the hidden author thread's tools; absent leaves the thread on the generic set. */
  readonly contextStore?: Pick<T3TeamThreadToolContextStoreShape, "put"> | undefined;
  readonly nowMs?: (() => number) | undefined;
  /** Test seam: the author turn's wall-clock ceiling. */
  readonly authorTurnTimeoutMs?: number | undefined;
  /** Runs `recipe` by id with its bindings; absent refuses `recipe`. */
  readonly recipeRun?: RecipeRun.RecipeRunByIdDeps | undefined;
}

export function makeWorkflowRunToolHandlers<E>(
  deps: WorkflowRunToolDeps<E>,
): (threadId: ThreadId) => T3TeamWorkflowRunToolHandlers {
  const { fileSystem, path } = deps;
  return (threadId) => ({
    runWorkflow: (args) => {
      const session = workflowAuthorSessionForThread(String(threadId));
      if (session !== undefined) return submitAuthoredWorkflowSource(session, args);
      if (!fileSystem || !path) {
        return Effect.fail(
          "Filesystem services are not available for t3_orchestration_run in this runtime.",
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
        const providers =
          deps.listProviders === undefined ? undefined : yield* deps.listProviders();
        const runId = t3teamRandomUUID();
        const common = {
          runId,
          args: args.args ?? {},
          workspaceRoot,
          checkoutRoot: threadCheckoutRoot(thread, workspaceRoot),
          launchThreadId: threadId,
          projectId: thread.projectId,
          modelSelection,
          runtimeMode: thread.runtimeMode,
          interactionMode: thread.interactionMode,
        };
        const { recipeRun, pinnedPath } = yield* resolveRunTarget({
          ...common,
          recipeRun: deps.recipeRun,
          args,
          fileSystem,
          path,
          threadId,
          providers,
        });

        // Arguments are valid; now the one launch-per-turn rule (GHE #415), before anything durable.
        const recentRows = yield* deps.launch.runRepository
          .listLiveByLaunchThread({ launchThreadId: String(threadId) })
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

        const launch: PreparedWorkflowLaunchDeps = { ...deps.launch, fileSystem, path };
        if (recipeRun !== undefined) {
          return yield* RecipeRun.launchRecipeRun(recipeRun, launch, {
            ...common,
            threadId,
            intent: args.intent,
          });
        }
        if (pinnedPath !== undefined) {
          return yield* launchDetachedWorkflow(launch, {
            ...common,
            workflowPath: pinnedPath,
            intent: args.intent,
            origin: "ephemeral",
          });
        }

        let admittedResolve: (() => void) | undefined;
        let admittedReject: ((error: unknown) => void) | undefined;
        const admitted = new Promise<void>((resolve, reject) => {
          admittedResolve = resolve;
          admittedReject = reject;
        });
        const authorModelSelection = yield* resolveWorkflowAuthorModel(modelSelection, providers);
        const authoring = startAuthoredWorkflowRun(
          {
            launch,
            author: { newId: () => t3teamRandomUUID(), nowIso, contextStore: deps.contextStore },
            listProviders:
              deps.listProviders === undefined
                ? undefined
                : () => Effect.runPromise(deps.listProviders!()),
            turnTimeoutMs: deps.authorTurnTimeoutMs,
          },
          {
            ...common,
            intent: args.intent,
            authorModelSelection,
            draftSource: args.source?.trim() || undefined,
            onAdmitted: async () => admittedResolve?.(),
          },
        ).pipe(Effect.tapError((error) => Effect.sync(() => admittedReject?.(error))));
        yield* authoring.pipe(Effect.forkDetach({ startImmediately: true }));
        yield* Effect.promise(() => admitted).pipe(Effect.mapError(errorMessage));
        return {
          ok: true as const,
          runId,
          status: "authoring" as const,
          handoff: "workflow-ui" as const,
        } satisfies RunWorkflowToolResult;
      });
    },
  });
}
