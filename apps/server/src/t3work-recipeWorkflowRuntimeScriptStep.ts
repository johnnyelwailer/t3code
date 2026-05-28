import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { pathToFileURL } from "node:url";
import {
  PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_STEP,
  ProjectRecipeConversationCard,
  ProjectRecipeWorkflowCardPhase,
  type ProjectRecipeConversationCard as ProjectRecipeConversationCardType,
  type ProjectRecipeWorkflowStep as ProjectRecipeWorkflowStepType,
} from "@t3tools/project-recipes";

import type { OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import { upsertWorkflowCardSystemMessage } from "./t3work-recipeWorkflowRuntimeMessages.ts";
import { upsertThreadActivity } from "./t3work-recipeWorkflowRuntimeActivities.ts";
import type { PresentedWorkflowCardState } from "./t3work-recipeWorkflowRuntimeExecutionTypes.ts";
import {
  resolveWithinRoot,
  stepActivityId,
  type PersistedRecipeWorkflowRunState,
} from "./t3work-recipeWorkflowRuntimeShared.ts";

const isProjectRecipeConversationCard = Schema.is(ProjectRecipeConversationCard);

export const executeScriptWorkflowStep = Effect.fn("executeScriptWorkflowStep")(function* (input: {
  orchestration: OrchestrationEngineShape;
  state: PersistedRecipeWorkflowRunState;
  step: Extract<ProjectRecipeWorkflowStepType, { kind: "script" }>;
  createdAt: string;
  recipeBasePath: string;
}) {
  const fileSystem = yield* FileSystem.FileSystem;
  const pathService = yield* Path.Path;
  const runtimeContext = yield* Effect.context<FileSystem.FileSystem>();
  const runPromise = Effect.runPromiseWith(runtimeContext);

  yield* upsertThreadActivity({
    orchestration: input.orchestration,
    threadId: input.state.threadId,
    activityId: stepActivityId(input.state.threadId, input.step.id),
    createdAt: input.createdAt,
    kind: PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_STEP,
    summary: `Running script step ${input.step.id}`,
    payload: {
      workflowRunId: input.state.workflowRunId,
      stepId: input.step.id,
      stepKind: input.step.kind,
      phase: "started",
    },
  });

  const [relativeModulePath, exportName = "default"] = input.step.module.split("#", 2);
  const modulePath = resolveWithinRoot(
    pathService,
    input.recipeBasePath,
    relativeModulePath ?? input.step.module,
  );
  const moduleUrl = pathToFileURL(modulePath);
  moduleUrl.searchParams.set("v", String(yield* Clock.currentTimeMillis));
  const imported = (yield* Effect.tryPromise(() => import(moduleUrl.toString()))) as Record<
    string,
    unknown
  >;
  const exported = imported[exportName];
  if (typeof exported !== "function") {
    yield* upsertThreadActivity({
      orchestration: input.orchestration,
      threadId: input.state.threadId,
      activityId: stepActivityId(input.state.threadId, input.step.id),
      createdAt: input.createdAt,
      kind: PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_STEP,
      summary: `Script step ${input.step.id} is invalid`,
      payload: {
        workflowRunId: input.state.workflowRunId,
        stepId: input.step.id,
        stepKind: input.step.kind,
        phase: "failed",
        error: `Export '${exportName}' is not a function.`,
      },
      tone: "error",
    });
    return null;
  }

  let presentedCard: PresentedWorkflowCardState | null = null;
  const scriptApi = {
    workspace: {
      rootPath: input.state.workspaceRoot,
      recipePath: input.recipeBasePath,
      readText: async (relativePath: string) =>
        runPromise(
          fileSystem.readFileString(
            resolveWithinRoot(pathService, input.recipeBasePath, relativePath),
          ),
        ),
      writeText: async (relativePath: string, contents: string) => {
        const targetPath = resolveWithinRoot(pathService, input.recipeBasePath, relativePath);
        await runPromise(
          fileSystem
            .makeDirectory(pathService.dirname(targetPath), { recursive: true })
            .pipe(Effect.andThen(fileSystem.writeFileString(targetPath, contents))),
        );
      },
      exists: async (relativePath: string) =>
        runPromise(
          fileSystem
            .exists(resolveWithinRoot(pathService, input.recipeBasePath, relativePath))
            .pipe(Effect.orElseSucceed(() => false)),
        ),
    },
    workflow: {
      presentCard: async (
        card: ProjectRecipeConversationCardType,
        options?: {
          awaitingActionId?: string;
          phase?: typeof ProjectRecipeWorkflowCardPhase.Type;
        },
      ) => {
        if (!isProjectRecipeConversationCard(card)) {
          throw new Error("Script-presented workflow cards must match the host card schema.");
        }
        presentedCard = { cardId: card.id, activityStepId: input.step.id, card };
        await runPromise(
          upsertWorkflowCardSystemMessage({
            orchestration: input.orchestration,
            threadId: input.state.threadId,
            workflowRunId: input.state.workflowRunId,
            recipeId: input.state.launch.recipeId,
            stepId: input.step.id,
            card,
            phase: options?.phase ?? "presented",
            createdAt: input.createdAt,
            ...(options?.awaitingActionId ? { awaitingActionId: options.awaitingActionId } : {}),
          }),
        );
      },
    },
    fetch,
    log: { info: () => undefined, warn: () => undefined, error: () => undefined },
  };

  const result = yield* Effect.promise(() =>
    Promise.resolve(
      (exported as Function)(
        {
          threadId: input.state.threadId,
          workflowRunId: input.state.workflowRunId,
          workspaceRoot: input.state.workspaceRoot,
          recipePath: input.recipeBasePath,
          recipe: input.state.launch,
        },
        scriptApi,
      ),
    ),
  );

  if (isProjectRecipeConversationCard(result)) {
    presentedCard = { cardId: result.id, activityStepId: input.step.id, card: result };
    yield* upsertWorkflowCardSystemMessage({
      orchestration: input.orchestration,
      threadId: input.state.threadId,
      workflowRunId: input.state.workflowRunId,
      recipeId: input.state.launch.recipeId,
      stepId: input.step.id,
      card: result,
      phase: "presented",
      createdAt: input.createdAt,
    });
  }

  yield* upsertThreadActivity({
    orchestration: input.orchestration,
    threadId: input.state.threadId,
    activityId: stepActivityId(input.state.threadId, input.step.id),
    createdAt: input.createdAt,
    kind: PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_STEP,
    summary: `Completed script step ${input.step.id}`,
    payload: {
      workflowRunId: input.state.workflowRunId,
      stepId: input.step.id,
      stepKind: input.step.kind,
      phase: "completed",
    },
  });

  return presentedCard;
});
