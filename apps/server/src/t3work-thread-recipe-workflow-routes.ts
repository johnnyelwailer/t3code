import { CommandId, MessageId, ThreadId } from "@t3tools/contracts";
import {
  type LaunchProjectRecipeWorkflowRequest,
  type SubmitProjectRecipeCardActionRequest,
} from "@t3tools/project-recipes";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import { HttpRouter } from "effect/unstable/http";

import {
  errorResponse,
  okJson,
  readJsonBody,
  T3workAtlassianError,
} from "./t3work-atlassian-http.ts";
import { ProjectionSnapshotQuery } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine.ts";
import {
  runProjectRecipeWorkflowLaunch,
  submitProjectRecipeCardAction,
  upsertProjectRecipeLaunchActivity,
} from "./t3work-recipeWorkflowRuntime.ts";
import { toT3workError } from "./t3work-project-repository-utils.ts";

const loadThreadProjectContext = Effect.fn("loadThreadProjectContext")(function* (
  threadId: ThreadId,
) {
  const projectionSnapshotQuery = yield* ProjectionSnapshotQuery;
  const thread = yield* projectionSnapshotQuery
    .getThreadDetailById(threadId)
    .pipe(Effect.map((threadOption) => (threadOption._tag === "Some" ? threadOption.value : null)));
  if (!thread) {
    return yield* new T3workAtlassianError({ message: "Thread not found." });
  }

  const project = yield* projectionSnapshotQuery
    .getProjectShellById(thread.projectId)
    .pipe(
      Effect.map((projectOption) => (projectOption._tag === "Some" ? projectOption.value : null)),
    );
  if (!project) {
    return yield* new T3workAtlassianError({ message: "Project not found." });
  }

  return { project, thread };
});

export const t3workThreadRecipeWorkflowLaunchRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3work/thread/recipe-workflow/launch",
  Effect.gen(function* () {
    const orchestrationEngine = yield* OrchestrationEngineService;
    const input = yield* readJsonBody<LaunchProjectRecipeWorkflowRequest>();
    const threadIdInput = input.threadId?.trim() ?? "";
    const kickoffMessage = input.kickoffMessage?.trim() ?? "";

    if (threadIdInput.length === 0) {
      return yield* new T3workAtlassianError({ message: "threadId is required." });
    }
    if (kickoffMessage.length === 0) {
      return yield* new T3workAtlassianError({ message: "kickoffMessage is required." });
    }
    if (!input.launch || typeof input.launch !== "object") {
      return yield* new T3workAtlassianError({ message: "launch is required." });
    }

    const threadId = ThreadId.make(threadIdInput);
    const { project } = yield* loadThreadProjectContext(threadId);

    const program = Effect.gen(function* () {
      const prepared = yield* runProjectRecipeWorkflowLaunch({
        orchestration: orchestrationEngine,
        threadId,
        workspaceRoot: project.workspaceRoot,
        launch: input.launch,
        kickoffMessage,
        createdAt: input.createdAt,
      });

      yield* upsertProjectRecipeLaunchActivity({
        orchestration: orchestrationEngine,
        threadId,
        launch: input.launch,
        phase: "bootstrapping-agent",
        createdAt: input.createdAt,
      });

      yield* orchestrationEngine.dispatch({
        type: "thread.turn.start",
        commandId: CommandId.make(`server:t3work:recipe-workflow-launch:${crypto.randomUUID()}`),
        threadId,
        message: {
          messageId: MessageId.make(
            `server:t3work:recipe-workflow-launch-message:${crypto.randomUUID()}`,
          ),
          role: "user",
          text: prepared.kickoffMessage,
          attachments: [],
        },
        modelSelection: input.modelSelection as never,
        titleSeed: input.titleSeed as never,
        runtimeMode: input.runtimeMode as never,
        interactionMode: input.interactionMode as never,
        createdAt: input.createdAt,
      });

      yield* upsertProjectRecipeLaunchActivity({
        orchestration: orchestrationEngine,
        threadId,
        launch: input.launch,
        phase: "running",
        createdAt: input.createdAt,
      });

      return okJson({ ok: true });
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
    const { project } = yield* loadThreadProjectContext(threadId);
    const createdAt = yield* Effect.map(DateTime.now, DateTime.formatIso);

    yield* submitProjectRecipeCardAction({
      orchestration: orchestrationEngine,
      workspaceRoot: project.workspaceRoot,
      threadId,
      cardId,
      actionId,
      ...(input.submit ? { submit: input.submit } : {}),
      createdAt,
    });

    return okJson({ ok: true });
  }).pipe(
    Effect.mapError((cause) => toT3workError(cause, "Failed to submit recipe card action.")),
    Effect.catch(errorResponse),
  ),
);
