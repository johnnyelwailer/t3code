import { ThreadId } from "@t3tools/contracts";
import type { SubmitProjectRecipeCardActionRequest } from "@t3tools/project-recipes";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import { HttpRouter } from "effect/unstable/http";

import {
  errorResponse,
  okJson,
  readJsonBody,
  T3workAtlassianError,
} from "./t3work-atlassian-http.ts";
import { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine.ts";
import { upsertRecipeWorkflowAgentBootstrapContext } from "./t3work-recipeWorkflowAgentBootstrap.ts";
import { submitProjectRecipeCardAction } from "./t3work-recipeWorkflowRuntime.ts";
import { dispatchRecipeWorkflowTurnStart } from "./t3work-recipeWorkflowTurnStart.ts";
import { toT3workError } from "./t3work-project-repository-utils.ts";
import { loadThreadProjectContext } from "./t3work-thread-recipe-workflow-routes-shared.ts";

export const t3workThreadRecipeWorkflowCardActionRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3work/thread/recipe-workflow/card-action",
  Effect.gen(function* () {
    const orchestrationEngine = yield* OrchestrationEngineService;
    const input = yield* readJsonBody<SubmitProjectRecipeCardActionRequest>();
    const threadIdInput = input.threadId?.trim() ?? "";
    const cardId = input.cardId?.trim() ?? "";
    const actionId = input.actionId?.trim() ?? "";
    if (threadIdInput.length === 0) {
      return yield* new T3workAtlassianError({ message: "threadId is required." });
    }
    if (cardId.length === 0) {
      return yield* new T3workAtlassianError({ message: "cardId is required." });
    }
    if (actionId.length === 0) {
      return yield* new T3workAtlassianError({ message: "actionId is required." });
    }

    const threadId = ThreadId.make(threadIdInput);
    const { project, thread } = yield* loadThreadProjectContext(threadId);
    const createdAt = yield* Effect.map(DateTime.now, DateTime.formatIso);

    const resumed = yield* submitProjectRecipeCardAction({
      orchestration: orchestrationEngine,
      workspaceRoot: project.workspaceRoot,
      threadId,
      cardId,
      actionId,
      ...(input.submit ? { submit: input.submit } : {}),
      createdAt,
    });

    if (resumed.turnStartMessage) {
      yield* upsertRecipeWorkflowAgentBootstrapContext({
        orchestration: orchestrationEngine,
        threadId,
        workspaceRoot: project.workspaceRoot,
        launch: resumed.launch,
        stepId: resumed.turnStartStepId ?? "resume",
        createdAt,
        agentPromptText: resumed.turnStartMessage,
      });

      yield* dispatchRecipeWorkflowTurnStart({
        orchestration: orchestrationEngine,
        threadId,
        userTurnMessage: "",
        createdAt,
        modelSelection: thread.modelSelection,
        runtimeMode: thread.runtimeMode,
        interactionMode: thread.interactionMode,
        commandPrefix: "recipe-workflow-resume",
      });
    }

    return okJson({ ok: true, mode: "thread" });
  }).pipe(
    Effect.mapError((cause) => toT3workError(cause, "Failed to submit recipe card action.")),
    Effect.catch(errorResponse),
  ),
);
