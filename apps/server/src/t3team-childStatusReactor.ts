import { CommandId, ThreadId, type OrchestrationEvent } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

import { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import { TextGeneration } from "./textGeneration/TextGeneration.ts";
import { createChildStatusEventReactor } from "./t3team-childStatusSummarizer.ts";
import { resolveWorkflowAgentModel } from "./t3team-workflowAgentModelPolicy.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";

const ChildStatusOutput = Schema.Struct({ status: Schema.String });

const isChildThread = (thread: {
  readonly id: string;
  readonly activities: ReadonlyArray<{ readonly kind: string }>;
}) =>
  thread.id.includes(":repair:") ||
  thread.activities.some((activity) => activity.kind === "t3team.handoff.created");

/** Observes domain events and performs a separate structured generation request. */
export const T3TeamChildStatusReactorLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const engine = yield* OrchestrationEngineService;
    const query = yield* ProjectionSnapshotQuery;
    const textGeneration = yield* TextGeneration;
    const reactor = createChildStatusEventReactor({
      loadChild: async (threadId) => {
        const detail = await Effect.runPromise(
          query
            .getThreadDetailById(ThreadId.make(threadId))
            .pipe(Effect.orElseSucceed(() => Option.none())),
        );
        const child = Option.getOrUndefined(detail);
        return child && isChildThread(child)
          ? { id: child.id, modelSelection: resolveWorkflowAgentModel(child.modelSelection) }
          : null;
      },
      generate: async ({ modelSelection, activity }) => {
        if (!textGeneration.generateStructured) return null;
        const prompt = [
          'Summarize the child agent\'s current work as JSON: {"status":"..."}.',
          "Use 3-96 plain-text characters, present tense, specific and concise.",
          "Do not mention models, prompts, tools, agents, or internal runtime details.",
          `Recent activity metadata: ${JSON.stringify(activity)}`,
        ].join("\n");
        return Effect.runPromise(
          textGeneration.generateStructured({
            cwd: process.cwd(),
            prompt,
            outputSchema: ChildStatusOutput,
            modelSelection,
          }),
        );
      },
      persist: async ({ threadId, status }) => {
        await Effect.runPromise(
          engine.dispatch({
            type: "thread.meta.update",
            commandId: CommandId.make(`server:t3team:child-status:${t3teamRandomUUID()}`),
            threadId: ThreadId.make(threadId),
            childStatus: status,
          }),
        );
      },
      nowIso: () => DateTime.formatIso(DateTime.nowUnsafe()),
      onError: (cause) => {
        Effect.runFork(Effect.logWarning("child status summarizer timer failed", { cause }));
      },
    });

    const note = (event: OrchestrationEvent) =>
      Effect.gen(function* () {
        const meaningful =
          event.type === "thread.turn-diff-completed"
            ? {
                threadId: event.payload.threadId,
                kind: "turn.completed",
                summary: event.payload.status,
              }
            : event.type === "thread.activity-appended" &&
                event.payload.activity.kind !== "t3team.handoff.created"
              ? {
                  threadId: event.payload.threadId,
                  kind: event.payload.activity.kind,
                  summary: event.payload.activity.summary,
                }
              : null;
        if (!meaningful) return;
        yield* Effect.promise(() => reactor.handle(meaningful));
      });

    yield* Effect.forkScoped(
      Stream.runForEach(engine.streamDomainEvents, (event) =>
        note(event).pipe(
          Effect.catchCause((cause) =>
            Cause.hasInterruptsOnly(cause)
              ? Effect.failCause(cause)
              : Effect.logWarning("child status reactor event failed", {
                  eventType: event.type,
                  cause: Cause.pretty(cause),
                }),
          ),
        ),
      ),
    );
  }),
);
