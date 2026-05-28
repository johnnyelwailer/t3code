import type { OrchestrationEvent } from "@t3tools/contracts";
import { makeDrainableWorker } from "@t3tools/shared/DrainableWorker";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";

import { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import { upsertRecipeWorkflowAgentBootstrapContext } from "./t3work-recipeWorkflowAgentBootstrap.ts";
import { resumeProjectRecipeWorkflowAfterAgentReply } from "./t3work-recipeWorkflowRuntimeContinuation.ts";
import { dispatchRecipeWorkflowTurnStart } from "./t3work-recipeWorkflowTurnStart.ts";

type ThreadMessageSentEvent = Extract<OrchestrationEvent, { type: "thread.message-sent" }>;

export const T3workRecipeWorkflowRuntimeReactorLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const orchestration = yield* OrchestrationEngineService;
    const projectionSnapshotQuery = yield* ProjectionSnapshotQuery;

    const processThreadMessageSent = Effect.fn("processThreadMessageSent")(function* (
      event: ThreadMessageSentEvent,
    ) {
      if (event.payload.role !== "assistant" || event.payload.streaming) {
        return;
      }

      const thread = yield* projectionSnapshotQuery
        .getThreadDetailById(event.payload.threadId)
        .pipe(Effect.map(Option.getOrUndefined));
      if (!thread) {
        return;
      }

      const project = yield* projectionSnapshotQuery
        .getProjectShellById(thread.projectId)
        .pipe(Effect.map(Option.getOrUndefined));
      if (!project) {
        return;
      }

      const resumed = yield* resumeProjectRecipeWorkflowAfterAgentReply({
        orchestration,
        workspaceRoot: project.workspaceRoot,
        threadId: event.payload.threadId,
        messageText: event.payload.text,
        createdAt: event.payload.updatedAt,
      });
      if (!resumed?.turnStartMessage) {
        return;
      }

      yield* upsertRecipeWorkflowAgentBootstrapContext({
        orchestration,
        threadId: thread.id,
        workspaceRoot: project.workspaceRoot,
        launch: resumed.stateSnapshot.launch,
        stepId: resumed.turnStartStepId ?? "resume",
        createdAt: event.payload.updatedAt,
        agentPromptText: resumed.turnStartMessage,
      });

      yield* dispatchRecipeWorkflowTurnStart({
        orchestration,
        threadId: thread.id,
        userTurnMessage: "",
        createdAt: event.payload.updatedAt,
        modelSelection: thread.modelSelection,
        runtimeMode: thread.runtimeMode,
        interactionMode: thread.interactionMode,
        commandPrefix: "recipe-workflow-agent-resume",
      });
    });

    const processThreadMessageSentSafely = (event: ThreadMessageSentEvent) =>
      processThreadMessageSent(event).pipe(
        Effect.catchCause((cause) => {
          if (Cause.hasInterruptsOnly(cause)) {
            return Effect.failCause(cause);
          }
          return Effect.logWarning("t3work recipe workflow reactor failed to process event", {
            eventType: event.type,
            threadId: event.payload.threadId,
            cause: Cause.pretty(cause),
          });
        }),
      );

    const worker = yield* makeDrainableWorker(processThreadMessageSentSafely);

    yield* Effect.forkScoped(
      Stream.runForEach(orchestration.streamDomainEvents, (event) => {
        if (event.type !== "thread.message-sent") {
          return Effect.void;
        }
        return worker.enqueue(event);
      }),
    );
  }),
);
