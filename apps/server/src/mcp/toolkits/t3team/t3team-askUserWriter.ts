/**
 * Records a `t3team_ask_user` question as a V2 message-capability runtime
 * request on the thread's active run (critic G14): a `user_input_request`
 * node under the run's root node, a pending `runtime-request` with
 * `responseCapability: {type: "message"}`, and a `user_input_request` turn
 * item with `responseMode: "message"`.
 *
 * Message-capability requests are excluded from terminal dismissal, so the
 * question survives the asking turn ending and restarts. The user's answer
 * goes through upstream `runtime-request.respond`, which joins
 * "<question>\n<answer>" into a new user message (multi-select answers via
 * `t3teamUserInputAnswerText`). An agent cannot cancel or replace it.
 *
 * Guardrail: one pending message-mode question per thread — checked and
 * written under the thread lock, so two concurrent asks cannot both pass.
 * Note: while the question is open, upstream refuses a manual continuation
 * ("Resume") of the thread.
 *
 * @module mcp/toolkits/t3team/t3team-askUserWriter
 */
import {
  EventId,
  NodeId,
  type OrchestrationV2UserInputQuestion,
  RuntimeRequestId,
  type ThreadId,
  TurnItemId,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import * as EventSink from "../../../orchestration-v2/EventSink.ts";
import * as ProjectionStore from "../../../orchestration-v2/ProjectionStore.ts";
import * as ThreadCommandExecutor from "../../../orchestration-v2/ThreadCommandExecutor.ts";
import * as TurnItemPositionStore from "../../../orchestration-v2/TurnItemPositionStore.ts";
import { T3TeamV2WriterLayerLive } from "../../../t3team-v2/t3team-v2Layers.ts";

export class T3TeamAskUserError extends Schema.TaggedError<T3TeamAskUserError>()(
  "T3TeamAskUserError",
  { message: Schema.String },
) {}

export interface T3TeamAskUserAskInput {
  readonly threadId: ThreadId;
  /** Unique per ask; derives the request, node and turn-item ids. */
  readonly askId: string;
  readonly questions: ReadonlyArray<OrchestrationV2UserInputQuestion>;
}

export class T3TeamAskUserWriter extends Context.Service<
  T3TeamAskUserWriter,
  {
    readonly ask: (
      input: T3TeamAskUserAskInput,
    ) => Effect.Effect<{ readonly requestId: RuntimeRequestId }, T3TeamAskUserError>;
  }
>()("t3/mcp/toolkits/t3team/t3team-askUserWriter/T3TeamAskUserWriter") {}

export const askUserRequestId = (askId: string) => RuntimeRequestId.make(`t3team-ask:${askId}`);

const isAskUserError = Schema.is(T3TeamAskUserError);
const fail = (message: string) => Effect.fail(new T3TeamAskUserError({ message }));

const make = Effect.gen(function* () {
  const locks = yield* ThreadCommandExecutor.ThreadCommandExecutor;
  const sink = yield* EventSink.EventSinkV2;
  const projections = yield* ProjectionStore.ProjectionStoreV2;
  const positions = yield* TurnItemPositionStore.TurnItemPositionStoreV2;

  const askLocked = (input: T3TeamAskUserAskInput) =>
    Effect.gen(function* () {
      const { threadId } = input;
      const { thread, runtimeRequests } = yield* projections.getThreadRecords(threadId, [
        "runtimeRequests",
      ]);
      if (thread.deletedAt !== null || thread.archivedAt !== null) {
        return yield* fail("This thread is archived or deleted; it cannot ask the user.");
      }
      const outstanding = runtimeRequests.find(
        (request) =>
          request.status === "pending" &&
          request.kind === "user_input" &&
          request.responseCapability.type === "message",
      );
      if (outstanding !== undefined) {
        return yield* fail(
          `A question is already pending on this thread (requestId: ${outstanding.id}). It stays ` +
            `open until the user answers or dismisses it; agents cannot cancel or replace pending ` +
            `questions. Wait for the answer instead of asking again.`,
        );
      }
      const { run, providerThread, providerTurn } =
        yield* projections.getRunningTurnContext(threadId);
      if (run === undefined || run.rootNodeId === null) {
        return yield* fail("t3team_ask_user can only be called during an active turn.");
      }
      const rootNodeId = run.rootNodeId;

      const now = yield* DateTime.now;
      const requestId = askUserRequestId(input.askId);
      const nodeId = NodeId.make(`t3team-ask:${input.askId}:node`);
      const turnItemId = TurnItemId.make(`t3team-ask:${input.askId}:item`);
      const ordinal = yield* positions.allocate({ threadId, turnItemId, runId: run.id });
      const providerRefs = {
        providerThreadId: providerThread?.id ?? null,
        providerTurnId: providerTurn?.id ?? null,
      };
      const base = { threadId, runId: run.id, nodeId, occurredAt: now } as const;
      yield* sink.write({
        events: [
          {
            ...base,
            id: EventId.make(`t3team-ask:${input.askId}:node`),
            type: "node.updated",
            payload: {
              id: nodeId,
              threadId,
              runId: run.id,
              parentNodeId: rootNodeId,
              rootNodeId,
              kind: "user_input_request",
              status: "waiting",
              countsForRun: false,
              ...providerRefs,
              nativeItemRef: null,
              runtimeRequestId: requestId,
              checkpointScopeId: null,
              startedAt: now,
              completedAt: null,
            },
          },
          {
            ...base,
            id: EventId.make(`t3team-ask:${input.askId}:request`),
            type: "runtime-request.updated",
            payload: {
              id: requestId,
              nodeId,
              providerTurnId: providerRefs.providerTurnId,
              nativeRequestRef: null,
              kind: "user_input",
              status: "pending",
              responseCapability: { type: "message" },
              createdAt: now,
              resolvedAt: null,
            },
          },
          {
            ...base,
            id: EventId.make(`t3team-ask:${input.askId}:item`),
            type: "turn-item.updated",
            payload: {
              id: turnItemId,
              threadId,
              runId: run.id,
              nodeId,
              ...providerRefs,
              nativeItemRef: null,
              parentItemId: null,
              ordinal,
              status: "waiting",
              title: null,
              startedAt: now,
              completedAt: null,
              updatedAt: now,
              type: "user_input_request",
              requestId,
              questions: input.questions,
              responseMode: "message",
            },
          },
        ],
      });
      return { requestId };
    });

  const ask = (input: T3TeamAskUserAskInput) =>
    locks.withLock(input.threadId, askLocked(input)).pipe(
      Effect.mapError((cause) =>
        isAskUserError(cause)
          ? cause
          : new T3TeamAskUserError({ message: `Failed to record the question: ${String(cause)}` }),
      ),
      Effect.withSpan("t3team.askUser.ask"),
    );

  return T3TeamAskUserWriter.of({ ask });
});

/** Provided once in server.ts, over the runtime's shared thread lock and sink (by reference). */
export const T3TeamAskUserWriterLive = Layer.effect(T3TeamAskUserWriter, make).pipe(
  Layer.provide(T3TeamV2WriterLayerLive),
);
