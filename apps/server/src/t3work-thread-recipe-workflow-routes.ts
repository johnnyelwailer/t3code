import {
  DEFAULT_PROVIDER_INTERACTION_MODE,
  DEFAULT_RUNTIME_MODE,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import type { LaunchProjectRecipeWorkflowRequest } from "@t3tools/project-recipes";
import { createModelSelection } from "@t3tools/shared/model";
import * as Effect from "effect/Effect";
import { HttpRouter } from "effect/unstable/http";

import {
  errorResponse,
  okJson,
  readJsonBody,
  T3workAtlassianError,
} from "./t3work-atlassian-http.ts";
import { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine.ts";
import {
  runProjectRecipeWorkflowLaunch,
  runDeterministicProjectRecipeWorkflowLaunch,
  upsertProjectRecipeLaunchActivity,
} from "./t3work-recipeWorkflowRuntime.ts";
export { t3workThreadRecipeWorkflowCardActionRouteLayer } from "./t3work-thread-recipe-workflow-cardActionRoute.ts";
import { upsertRecipeWorkflowAgentBootstrapContext } from "./t3work-recipeWorkflowAgentBootstrap.ts";
import { readRecipeWorkflowLaunchContext } from "./t3work-recipeWorkflowLaunchContext.ts";
import { dispatchRecipeWorkflowTurnStart } from "./t3work-recipeWorkflowTurnStart.ts";
import { toT3workError } from "./t3work-project-repository-utils.ts";
import {
  isProviderInteractionMode,
  isRuntimeMode,
  loadThreadProjectContext,
} from "./t3work-thread-recipe-workflow-routes-shared.ts";
import type { T3workTurnToolContext } from "./t3work-toolBroker.ts";
import { T3workThreadToolContextStore } from "./t3work-threadToolContextStore.ts";

export const t3workThreadRecipeWorkflowLaunchRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3work/thread/recipe-workflow/launch",
  Effect.gen(function* () {
    const orchestrationEngine = yield* OrchestrationEngineService;
    const threadToolContextStore = yield* T3workThreadToolContextStore;
    const input = yield* readJsonBody<LaunchProjectRecipeWorkflowRequest>();
    const threadIdInput = input.threadId?.trim() ?? "";
    const workspaceRoot = input.workspaceRoot?.trim() ?? "";
    const kickoffMessage = input.kickoffMessage?.trim() ?? "";
    const titleSeed = input.titleSeed?.trim() ?? "";
    const modelInstanceId = input.modelSelection?.instanceId?.trim() ?? "";
    const modelName = input.modelSelection?.model?.trim() ?? "";
    if (!input.launch || typeof input.launch !== "object") {
      return yield* new T3workAtlassianError({ message: "launch is required." });
    }

    if (threadIdInput.length === 0) {
      if (workspaceRoot.length === 0) {
        return yield* new T3workAtlassianError({
          message: "workspaceRoot is required for deterministic recipe launches.",
        });
      }
      if (!input.toolContext || typeof input.toolContext !== "object") {
        return yield* new T3workAtlassianError({
          message: "toolContext is required for deterministic recipe launches.",
        });
      }

      const toolContext: T3workTurnToolContext = {
        surface: input.toolContext.surface,
        tools: input.toolContext.tools.map((tool) => ({
          id: tool.id,
          capabilities: [...tool.capabilities],
          ...(tool.label ? { label: tool.label } : {}),
        })),
        state: input.toolContext.state,
      };

      const result = yield* runDeterministicProjectRecipeWorkflowLaunch({
        workspaceRoot,
        launch: input.launch,
        kickoffMessage,
        createdAt: input.createdAt,
        toolContext,
      });

      return okJson({
        ok: true,
        mode: "deterministic",
        workflowRunId: result.workflowRunId,
        effects: result.effects,
        completionActivity: result.completionActivity,
      });
    }

    if (kickoffMessage.length === 0) {
      return yield* new T3workAtlassianError({ message: "kickoffMessage is required." });
    }
    if (modelInstanceId.length === 0 || modelName.length === 0) {
      return yield* new T3workAtlassianError({ message: "modelSelection is required." });
    }
    if (titleSeed.length === 0) {
      return yield* new T3workAtlassianError({ message: "titleSeed is required." });
    }

    const threadId = ThreadId.make(threadIdInput);
    const runtimeModeInput = input.runtimeMode;
    const interactionModeInput = input.interactionMode;
    const runtimeMode =
      runtimeModeInput && isRuntimeMode(runtimeModeInput) ? runtimeModeInput : DEFAULT_RUNTIME_MODE;
    const interactionMode =
      interactionModeInput && isProviderInteractionMode(interactionModeInput)
        ? interactionModeInput
        : DEFAULT_PROVIDER_INTERACTION_MODE;
    const modelSelection = createModelSelection(
      ProviderInstanceId.make(modelInstanceId),
      modelName,
    );
    const { project } = yield* loadThreadProjectContext(threadId);
    const launchContext = readRecipeWorkflowLaunchContext(
      yield* threadToolContextStore.get(threadId),
    );

    const program = Effect.gen(function* () {
      const prepared = yield* runProjectRecipeWorkflowLaunch({
        orchestration: orchestrationEngine,
        threadId,
        workspaceRoot: project.workspaceRoot,
        launch: input.launch,
        ...(launchContext ? { launchContext } : {}),
        kickoffMessage,
        createdAt: input.createdAt,
      });
      const preparedTurnStartStepId =
        "turnStartStepId" in prepared ? prepared.turnStartStepId : undefined;

      yield* upsertProjectRecipeLaunchActivity({
        orchestration: orchestrationEngine,
        threadId,
        launch: input.launch,
        phase: "bootstrapping-agent",
        createdAt: input.createdAt,
      });

      if (prepared.turnStartMessage) {
        yield* upsertRecipeWorkflowAgentBootstrapContext({
          orchestration: orchestrationEngine,
          threadId,
          workspaceRoot: project.workspaceRoot,
          launch: input.launch,
          stepId: preparedTurnStartStepId ?? "bootstrap",
          createdAt: input.createdAt,
          agentPromptText: prepared.turnStartMessage,
          userPromptText: prepared.kickoffMessage,
        });

        yield* dispatchRecipeWorkflowTurnStart({
          orchestration: orchestrationEngine,
          threadId,
          userTurnMessage: prepared.kickoffMessage,
          createdAt: input.createdAt,
          modelSelection,
          runtimeMode,
          interactionMode,
          titleSeed,
          commandPrefix: "recipe-workflow-launch",
        });

        yield* upsertProjectRecipeLaunchActivity({
          orchestration: orchestrationEngine,
          threadId,
          launch: input.launch,
          phase: "running",
          createdAt: input.createdAt,
        });
      }

      return okJson({ ok: true, mode: "thread" });
    });

    return yield* program.pipe(
      Effect.catchCause((cause) =>
        upsertProjectRecipeLaunchActivity({
          orchestration: orchestrationEngine,
          threadId,
          launch: input.launch,
          phase: "failed",
          createdAt: input.createdAt,
          error: "Failed to launch recipe workflow.",
        }).pipe(Effect.ignore, Effect.andThen(Effect.failCause(cause))),
      ),
    );
  }).pipe(
    Effect.mapError((cause) => toT3workError(cause, "Failed to launch recipe workflow.")),
    Effect.catch(errorResponse),
  ),
);
