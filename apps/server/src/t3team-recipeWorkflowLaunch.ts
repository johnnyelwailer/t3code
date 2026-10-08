/**
 * Launch a recipe's workflow on an existing thread through the durable engine (Epic 25). The one
 * launch path: the HTTP route (`t3team-thread-recipe-workflow-routes.ts`) decodes a request into
 * this, and a server-started launch (`t3team-startupRecipe.ts`) calls it directly.
 *
 * @module t3team-recipeWorkflowLaunch
 */
import type {
  ModelSelection,
  ProviderInteractionMode,
  RuntimeMode,
  ThreadId,
} from "@t3tools/contracts";
import { PROJECT_RECIPE_ACTIVITY_KIND_LAUNCH } from "@t3tools/project-recipes";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";

import { WorkflowJournalStore } from "./persistence/SqliteJournalStore.ts";
import { WorkflowRunRepository } from "./persistence/WorkflowRuns.ts";
import { WorkflowSignalStore } from "./persistence/WorkflowSignalStore.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";
import { resolveRecipeHostToolScope } from "./t3team-recipeWorkflowToolScope.ts";
import { resolveRecipeWorkflowScripts } from "./t3team-recipeWorkflowScripts.ts";
import { loadThreadProjectContext } from "./t3team-thread-recipe-workflow-routes-shared.ts";
import { T3TeamScriptHost } from "./t3team-scriptHostContext.ts";
import { T3TeamToolBroker } from "./t3team-toolBroker.ts";
import { T3TeamWorkflowEngineRegistry } from "./t3team-workflowEngineRegistry.ts";
import { launchPreparedWorkflow } from "./t3team-workflowEphemeralLaunch.ts";
import { T3TeamWorkflowHost, toWorkflowHostPort } from "./t3team-workflowHost.ts";
import { makeT3TeamWorkflowHostToolClient } from "./t3team-workflowHostTools.ts";
import { T3TeamWorkflowScheduler } from "./t3team-workflowScheduler.ts";
import { T3TeamWorkflowSignalReconciler } from "./t3team-workflowSignalReconciler.ts";

export interface RecipeWorkflowLaunchInput {
  readonly threadId: ThreadId;
  /** The recipe directory, already expanded to a physical path; scripts and tool scope come from it. */
  readonly recipePath: string | undefined;
  readonly workflowPath: string;
  readonly args: Record<string, unknown>;
  readonly modelSelection: ModelSelection;
  readonly runtimeMode: RuntimeMode;
  readonly interactionMode: ProviderInteractionMode;
}

export const launchRecipeWorkflow = Effect.fn("launchRecipeWorkflow")(function* (
  input: RecipeWorkflowLaunchInput,
) {
  const host = toWorkflowHostPort(yield* T3TeamWorkflowHost);
  const registry = yield* T3TeamWorkflowEngineRegistry;
  const runRepository = yield* WorkflowRunRepository;
  const journalStore = yield* WorkflowJournalStore;
  const scheduler = yield* T3TeamWorkflowScheduler;
  // Durable signal-source state (GHE #332); optional so test layers without the signal services
  // still launch — a run then simply has no signal verbs.
  const signalStore = Option.getOrUndefined(yield* Effect.serviceOption(WorkflowSignalStore));
  const signalReconciler = Option.getOrUndefined(
    yield* Effect.serviceOption(T3TeamWorkflowSignalReconciler),
  );
  const toolBroker = yield* T3TeamToolBroker;
  const scriptHosts = yield* T3TeamScriptHost;
  const { recipePath, workflowPath, threadId } = input;
  const { project, thread } = yield* loadThreadProjectContext(threadId);
  const runId = t3teamRandomUUID();

  // Stamp the launch thread with a recipe-launch activity BEFORE starting the run. The web
  // composer arms a one-shot "launch this recipe" override while a thread has a recipe
  // kickoffWorkflow and no launch activity yet; without this stamp the override never disarms,
  // so the very first reply a user types to answer the workflow's `askUser` re-launches the
  // recipe instead of resolving the pending ask (and the initial launch can double-fire).
  // On V2 the stamp is a keyed thread artifact (the host's activity), not a V1 activity.
  yield* Effect.promise(() =>
    host.upsertActivity({
      threadId,
      id: `t3team-recipe-launch:${runId}`,
      kind: PROJECT_RECIPE_ACTIVITY_KIND_LAUNCH,
      tone: "info",
      summary: "Recipe started",
      payload: { workflowRunId: runId },
    }),
  );

  // The launching recipe's private scripts (Epic 25 §Scripts): a `recipe.ts` recipe module's
  // `scripts` registration becomes the body's `scripts.*` tree. recipe.json recipes (no module)
  // resolve to an empty record and the engine keeps its `scripts: {}` default.
  const scripts = yield* resolveRecipeWorkflowScripts({ recipePath, workflowPath });

  // The body's `getTools()` bridge to the broker's host tools (work-item drafts, change-request
  // publishing), bound to THIS thread so a proposal lands where the recipe was launched and a publish
  // runs in its checkout. Scope comes from the RECIPE MODULE, never from a caller
  // (a caller that omitted it would be handed unrestricted scope); unresolvable ⇒ no bridge at
  // all, and the resolved scope is what is persisted as the grant, so a restart restores this.
  const hostToolScope = yield* resolveRecipeHostToolScope({ recipePath, workflowPath });
  if (hostToolScope.kind === "denied") {
    yield* Effect.logDebug("workflow launch runs without host tools", {
      runId,
      reason: hostToolScope.reason,
    });
  }
  const hostToolGrant =
    hostToolScope.kind === "granted" ? { toolGroups: hostToolScope.toolGroups } : undefined;
  const hostToolClient =
    hostToolScope.kind === "granted"
      ? makeT3TeamWorkflowHostToolClient({
          broker: toolBroker,
          launchThreadId: threadId,
          allowedToolGroups: hostToolScope.toolGroups,
        })
      : undefined;

  // `ctx.store` / `ctx.changeRequests` for the recipe's scripts, entitled by the same recipe
  // declaration as the host tools (never the request) and by the recipe's pack.
  const scriptHost = scriptHosts.forRun({
    projectId: thread.projectId,
    recipePath,
    toolGroups: hostToolGrant?.toolGroups,
  });

  // Shared launch-prep (spec D10): durable lifecycle row (origin 'recipe'), best-effort
  // play-as-shape preview, then the durable engine launch — the same funnel the ephemeral
  // `t3team.orchestration.run` tool drives through.
  const fileSystem = yield* FileSystem.FileSystem;
  return yield* launchPreparedWorkflow(
    {
      registry,
      runRepository,
      journalStore,
      rearmScheduler: () => scheduler.rearm(),
      host,
      fileSystem,
      ...(signalStore === undefined
        ? {}
        : {
            signalStore,
            ...(signalReconciler === undefined
              ? {}
              : { pokeSignalReconcile: () => void signalReconciler.reconcile().catch(() => {}) }),
          }),
    },
    {
      runId,
      workflowPath,
      args: input.args,
      // Persist the recipe dir alongside the resolved scripts so a restart can re-resolve them
      // during rehydration (a scriptless launch needs neither).
      ...(Object.keys(scripts).length === 0 || recipePath === undefined
        ? {}
        : { scripts, recipePath, scriptHost }),
      ...(hostToolClient === undefined || hostToolGrant === undefined
        ? {}
        : { hostToolClient, hostToolGrant }),
      workspaceRoot: project.workspaceRoot,
      launchThreadId: threadId,
      projectId: thread.projectId,
      modelSelection: input.modelSelection,
      runtimeMode: input.runtimeMode,
      interactionMode: input.interactionMode,
      origin: "recipe",
    },
  );
});
