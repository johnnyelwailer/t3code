import {
  DEFAULT_PROVIDER_INTERACTION_MODE,
  DEFAULT_RUNTIME_MODE,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import type { LaunchProjectRecipeWorkflowRequest } from "@t3tools/project-recipes";
import { toPhysicalProjectStatePath } from "@t3tools/project-context/t3teamProjectStateDir";
import { createModelSelection } from "@t3tools/shared/model";
import * as Effect from "effect/Effect";
import { HttpRouter } from "effect/http";

import { expandHomePath } from "./pathExpansion.ts";
import {
  errorResponse,
  okJson,
  readJsonBody,
  T3TeamAtlassianError,
} from "./t3team-atlassian-http.ts";
import { toT3TeamError } from "./t3team-project-repository-utils.ts";
import { resolveLaunchWorkflowPath } from "./t3team-projectRecipeActionLaunch.ts";
import { launchRecipeWorkflow } from "./t3team-recipeWorkflowLaunch.ts";
import {
  isProviderInteractionMode,
  isRuntimeMode,
} from "./t3team-thread-recipe-workflow-routes-shared.ts";

export { t3teamThreadWorkflowResolveInputRouteLayer } from "./t3team-thread-recipe-workflow-routes-resolve.ts";

/**
 * Launch a recipe's `.workflow.ts` through the durable engine (Epic 25): decodes the request and
 * hands it to {@link launchRecipeWorkflow}. A run that fires an ask verb suspends and is parked by
 * the registry; the workflow-engine reactor resumes it when the reply lands.
 */
export const t3teamThreadRecipeWorkflowLaunchRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/thread/recipe-workflow/launch",
  Effect.gen(function* () {
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
    // Single expansion point (pathExpansion.ts): a workspace-root recipePath may carry a literal
    // `~`; expand it ONCE so every downstream use below — plus the persisted run row — agrees.
    const recipePath = input.launch.recipePath
      ? toPhysicalProjectStatePath(expandHomePath(input.launch.recipePath))
      : undefined;
    // One recipe, several actions (Epic 16): a named action is resolved from the recipe's own
    // module, so it can only select a workflow the recipe declares. No name ⇒ defaultAction.
    const workflowPath = yield* resolveLaunchWorkflowPath({
      recipePath,
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
    const result = yield* launchRecipeWorkflow({
      threadId,
      recipePath,
      workflowPath,
      args: input.launch.parameters ?? {},
      modelSelection,
      runtimeMode,
      interactionMode,
    });

    return okJson({ ok: true, mode: "engine", runId: result.runId, status: result.status });
  }).pipe(
    Effect.mapError((cause) => toT3TeamError(cause, "Failed to launch recipe workflow.")),
    Effect.catch(errorResponse),
  ),
);
