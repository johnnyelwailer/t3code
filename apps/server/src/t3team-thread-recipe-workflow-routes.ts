import {
  CommandId,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  DEFAULT_RUNTIME_MODE,
  EventId,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import { PROJECT_RECIPE_ACTIVITY_KIND_LAUNCH } from "@t3tools/project-recipes";
import type { LaunchProjectRecipeWorkflowRequest } from "@t3tools/project-recipes";
import { createModelSelection } from "@t3tools/shared/model";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import { HttpRouter } from "effect/unstable/http";

import {
  errorResponse,
  okJson,
  readJsonBody,
  T3TeamAtlassianError,
} from "./t3team-atlassian-http.ts";
import { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine.ts";
import { WorkflowJournalStore } from "./persistence/Services/WorkflowJournalStore.ts";
import { WorkflowRunRepository } from "./persistence/Services/WorkflowRuns.ts";
import { toT3TeamError } from "./t3team-project-repository-utils.ts";
import { resolveLaunchWorkflowPath } from "./t3team-projectRecipeActionLaunch.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";
import { resolveRecipeWorkflowScripts } from "./t3team-recipeWorkflowScripts.ts";
import { launchPreparedWorkflow } from "./t3team-workflowEphemeralLaunch.ts";
import {
  isProviderInteractionMode,
  isRuntimeMode,
  loadThreadProjectContext,
} from "./t3team-thread-recipe-workflow-routes-shared.ts";
import { nowIso } from "./t3team-thread-recipe-workflow-routes-resolve.ts";
import { T3TeamWorkflowEngineRegistry } from "./t3team-workflowEngineRegistry.ts";
import { T3TeamWorkflowScheduler } from "./t3team-workflowScheduler.ts";
import { T3TeamToolBroker } from "./t3team-toolBroker.ts";
import { makeT3TeamWorkflowHostDraftToolClient } from "./t3team-workflowHostDraftTools.ts";
import { resolveRecipeHostToolScope } from "./t3team-recipeWorkflowToolScope.ts";

export { t3teamThreadWorkflowResolveInputRouteLayer } from "./t3team-thread-recipe-workflow-routes-resolve.ts";

/**
 * Launch a recipe's `.workflow.ts` through the durable engine (Epic 25). Replaces the legacy
 * step-union launch: it resolves the launching thread's project, builds a per-run
 * orchestration broker, and calls `startWorkflow`. A run that fires an ask verb suspends and is
 * parked by the registry; the workflow-engine reactor resumes it when the reply lands.
 */
export const t3teamThreadRecipeWorkflowLaunchRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/thread/recipe-workflow/launch",
  Effect.gen(function* () {
    const orchestration = yield* OrchestrationEngineService;
    const registry = yield* T3TeamWorkflowEngineRegistry;
    const runRepository = yield* WorkflowRunRepository;
    const journalStore = yield* WorkflowJournalStore;
    const scheduler = yield* T3TeamWorkflowScheduler;
    const toolBroker = yield* T3TeamToolBroker;
    const input = yield* readJsonBody<LaunchProjectRecipeWorkflowRequest>();

    const threadIdInput = input.threadId?.trim() ?? "";
    const modelInstanceId = input.modelSelection?.instanceId?.trim() ?? "";
    const modelName = input.modelSelection?.model?.trim() ?? "";
    if (!input.launch || typeof input.launch !== "object") {
      return yield* new T3TeamAtlassianError({ message: "launch is required." });
    }
    const defaultWorkflowPath = input.launch.workflowPath?.trim() ?? "";
    const actionName = input.launch.actionName?.trim() ?? "";
    if (defaultWorkflowPath.length === 0 && actionName.length === 0) {
      return yield* new T3TeamAtlassianError({
        message: "launch.workflowPath is required: this recipe has no .workflow.ts to run.",
      });
    }
    // One recipe, several actions (Epic 16): a named action is resolved from the recipe's own
    // module, so it can only select a workflow the recipe declares. No name ⇒ defaultAction.
    const workflowPath = yield* resolveLaunchWorkflowPath({
      recipePath: input.launch.recipePath,
      workflowPath: defaultWorkflowPath,
      actionName,
    });
    if (threadIdInput.length === 0) {
      return yield* new T3TeamAtlassianError({
        message:
          "threadId is required: headless recipe launches are not yet supported by the engine.",
      });
    }
    if (modelInstanceId.length === 0 || modelName.length === 0) {
      return yield* new T3TeamAtlassianError({ message: "modelSelection is required." });
    }

    const threadId = ThreadId.make(threadIdInput);
    const runtimeMode =
      input.runtimeMode && isRuntimeMode(input.runtimeMode)
        ? input.runtimeMode
        : DEFAULT_RUNTIME_MODE;
    const interactionMode =
      input.interactionMode && isProviderInteractionMode(input.interactionMode)
        ? input.interactionMode
        : DEFAULT_PROVIDER_INTERACTION_MODE;
    const modelSelection = createModelSelection(
      ProviderInstanceId.make(modelInstanceId),
      modelName,
    );
    const { project, thread } = yield* loadThreadProjectContext(threadId);

    const dispatch = (command: Parameters<typeof orchestration.dispatch>[0]): Promise<void> =>
      Effect.runPromise(orchestration.dispatch(command)).then(() => undefined);

    const runId = t3teamRandomUUID();
    const args = input.launch.parameters ?? {};

    // Stamp the launch thread with a recipe-launch activity BEFORE starting the run. The web
    // composer arms a one-shot "launch this recipe" override while a thread has a recipe
    // kickoffWorkflow and no launch activity yet; without this stamp the override never disarms,
    // so the very first reply a user types to answer the workflow's `askUser` re-launches the
    // recipe instead of resolving the pending ask (and the initial launch can double-fire).
    yield* Effect.promise(() =>
      dispatch({
        type: "thread.activity.append",
        commandId: CommandId.make(`t3team-recipe-launch:${runId}`),
        threadId,
        activity: {
          id: EventId.make(`t3team-recipe-launch:${runId}`),
          tone: "info",
          kind: PROJECT_RECIPE_ACTIVITY_KIND_LAUNCH,
          summary: "Recipe started",
          payload: { workflowRunId: runId },
          turnId: null,
          createdAt: nowIso(),
        },
        createdAt: nowIso(),
      }),
    );

    // The launching recipe's private scripts (Epic 25 §Scripts): a `recipe.ts` recipe module's
    // `scripts` registration becomes the body's `scripts.*` tree. recipe.json recipes (no
    // module) resolve to an empty record and the engine keeps its `scripts: {}` default.
    const scripts = yield* resolveRecipeWorkflowScripts({
      recipePath: input.launch.recipePath,
      workflowPath,
    });

    // The body's `getTools()` bridge to the broker's work-item DRAFT tools, bound to THIS thread so
    // a proposal lands where the user launched it. Scope comes from the RECIPE MODULE, never from
    // the client-supplied `input.launch.allowedToolGroups` (a caller that omitted it would be
    // handed unrestricted scope); unresolvable ⇒ no bridge at all, and the resolved scope is what
    // is persisted as the grant, so a restart restores this rather than the request.
    const hostToolScope = yield* resolveRecipeHostToolScope({
      recipePath: input.launch.recipePath,
      workflowPath,
    });
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
        ? makeT3TeamWorkflowHostDraftToolClient({
            broker: toolBroker,
            launchThreadId: threadIdInput,
            allowedToolGroups: hostToolScope.toolGroups,
          })
        : undefined;

    // Shared launch-prep (spec D10): durable lifecycle row (origin 'recipe'), best-effort
    // play-as-shape preview, then the durable engine launch — the same funnel the ephemeral
    // `t3team.orchestration.run` tool drives through.
    const fileSystem = yield* FileSystem.FileSystem;
    const result = yield* launchPreparedWorkflow(
      {
        registry,
        runRepository,
        journalStore,
        rearmScheduler: () => scheduler.rearm(),
        dispatch,
        fileSystem,
      },
      {
        runId,
        workflowPath,
        args,
        // Persist the recipe dir alongside the resolved scripts so a restart can re-resolve
        // them during rehydration (a scriptless launch needs neither).
        ...(Object.keys(scripts).length === 0
          ? {}
          : { scripts, recipePath: input.launch.recipePath }),
        ...(hostToolClient === undefined || hostToolGrant === undefined
          ? {}
          : { hostToolClient, hostToolGrant }),
        workspaceRoot: project.workspaceRoot,
        launchThreadId: threadIdInput,
        projectId: thread.projectId,
        modelSelection,
        runtimeMode,
        interactionMode,
        origin: "recipe",
      },
    );

    return okJson({ ok: true, mode: "engine", runId: result.runId, status: result.status });
  }).pipe(
    Effect.mapError((cause) => toT3TeamError(cause, "Failed to launch recipe workflow.")),
    Effect.catch(errorResponse),
  ),
);
