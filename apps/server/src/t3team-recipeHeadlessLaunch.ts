/**
 * Headless recipe launch (S5b) — the missing launch route the durable engine already supported:
 * `launchThreadId: undefined` on the shared prepared-launch funnel.
 *
 * Two callers, one service:
 *   • the recipe trigger runner (origin `"trigger"`) — one viewer change-request event becomes
 *     one headless run, with the args a trigger's `select` produced;
 *   • the `t3team.recipe.launchHeadless` RPC (origin `"recipe"`), which pack views'
 *     `launchRecipe` calls from a surface that has a project but no thread.
 *
 * Headless means NO launch thread: no recipe-launch fact to record, no composer-override stamp,
 * and no host-tool bridge (a thread-bound scope is impossible without a thread to bind it to).
 * The run still carries the recipe's own `allowedToolGroups` — that is what its scripts and its
 * agent bodies may reach, and nothing else.
 *
 * @module t3team-recipeHeadlessLaunch
 */
import {
  DEFAULT_PROVIDER_INTERACTION_MODE,
  DEFAULT_RUNTIME_MODE,
  type ModelSelection,
  type ProjectId,
  type ProviderInteractionMode,
  type RuntimeMode,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { WorkflowJournalStore } from "./persistence/SqliteJournalStore.ts";
import { WorkflowRunRepository, type WorkflowRunOrigin } from "./persistence/WorkflowRuns.ts";
import { WorkflowSignalStore } from "./persistence/WorkflowSignalStore.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";
import { T3TeamScriptHost } from "./t3team-scriptHostContext.ts";
import { resolveRecipeWorkflowScripts } from "./t3team-recipeWorkflowScripts.ts";
import { T3TeamWorkflowEngineRegistry } from "./t3team-workflowEngineRegistry.ts";
import { launchPreparedWorkflow } from "./t3team-workflowEphemeralLaunch.ts";
import { T3TeamWorkflowHost, toWorkflowHostPort } from "./t3team-workflowHost.ts";
import { T3TeamWorkflowScheduler } from "./t3team-workflowScheduler.ts";
import { T3TeamWorkflowSignalReconciler } from "./t3team-workflowSignalReconciler.ts";

export interface HeadlessRecipeLaunchInput {
  readonly projectId: ProjectId;
  readonly workspaceRoot: string;
  /** The recipe directory (project-local or pack-shipped) the launch runs from. */
  readonly recipePath: string;
  /** The resolved `.workflow.ts` — default action, or a named one. */
  readonly workflowPath: string;
  /** The launching recipe's identity (the run row's recipe fields). */
  readonly recipe: {
    readonly id: string;
    readonly version?: string;
    readonly action?: string | undefined;
  };
  readonly args: Record<string, unknown>;
  readonly modelSelection: ModelSelection;
  readonly runtimeMode?: RuntimeMode;
  readonly interactionMode?: ProviderInteractionMode;
  /** The recipe's declared tool groups — the only grant a headless run holds. */
  readonly allowedToolGroups?: ReadonlyArray<string> | undefined;
  readonly origin: WorkflowRunOrigin;
}

export const launchHeadlessRecipeWorkflow = Effect.fn("launchHeadlessRecipeWorkflow")(function* (
  input: HeadlessRecipeLaunchInput,
) {
  const host = toWorkflowHostPort(yield* T3TeamWorkflowHost);
  const registry = yield* T3TeamWorkflowEngineRegistry;
  const runRepository = yield* WorkflowRunRepository;
  const journalStore = yield* WorkflowJournalStore;
  const scheduler = yield* T3TeamWorkflowScheduler;
  const scriptHosts = yield* T3TeamScriptHost;
  // Durable signal-source state (GHE #332); optional so test layers without the signal
  // services still launch — a run then simply has no signal verbs (same rule as the
  // thread-bound launch).
  const signalStore = Option.getOrUndefined(yield* Effect.serviceOption(WorkflowSignalStore));
  const signalReconciler = Option.getOrUndefined(
    yield* Effect.serviceOption(T3TeamWorkflowSignalReconciler),
  );
  const runId = t3teamRandomUUID();

  // The recipe's private scripts, re-resolved from its directory exactly like the thread-bound
  // launch — a headless run is still a recipe run.
  const scripts = yield* resolveRecipeWorkflowScripts({
    recipePath: input.recipePath,
    workflowPath: input.workflowPath,
  });
  // No host-tool bridge exists for a headless run, so the script host is entitled by the
  // recipe's OWN tool groups (its `ctx.store` / `ctx.changeRequests` surface), never by a
  // caller-supplied scope.
  const scriptHost = scriptHosts.forRun({
    projectId: input.projectId,
    recipePath: input.recipePath,
    toolGroups: input.allowedToolGroups,
  });

  return yield* launchPreparedWorkflow(
    {
      registry,
      runRepository,
      journalStore,
      rearmScheduler: () => scheduler.rearm(),
      host,
      ...(signalStore === undefined
        ? {}
        : {
            signalStore,
            ...(signalReconciler === undefined
              ? {}
              : {
                  pokeSignalReconcile: () => {
                    void signalReconciler.reconcile().catch(() => {});
                  },
                }),
          }),
    },
    {
      runId,
      workflowPath: input.workflowPath,
      args: input.args,
      recipePath: input.recipePath,
      ...(Object.keys(scripts).length === 0 ? {} : { scripts, scriptHost }),
      workspaceRoot: input.workspaceRoot,
      launchThreadId: undefined,
      projectId: input.projectId,
      modelSelection: input.modelSelection,
      runtimeMode: input.runtimeMode ?? DEFAULT_RUNTIME_MODE,
      interactionMode: input.interactionMode ?? DEFAULT_PROVIDER_INTERACTION_MODE,
      origin: input.origin,
    },
  );
});
