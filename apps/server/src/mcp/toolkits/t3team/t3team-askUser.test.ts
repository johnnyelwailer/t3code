import { assert, it } from "@effect/vitest";
import {
  CommandId,
  EventId,
  MessageId,
  type OrchestrationV2Run,
  ThreadId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as Orchestrator from "../../../orchestration-v2/Orchestrator.ts";
import * as ProjectionStore from "../../../orchestration-v2/ProjectionStore.ts";
import { layerMemory as SqlitePersistenceMemory } from "../../../persistence/Sqlite.ts";
import {
  createTestThread,
  makeT3TeamV2TestLayer,
} from "../../../t3team-v2/t3team-v2Orchestrator.testkit.ts";
import { t3TeamAskUser } from "./t3team-askUser.ts";
import { T3TeamAskUserWriterLive } from "./t3team-askUserWriter.ts";

const TestLayer = Layer.mergeAll(
  makeT3TeamV2TestLayer("t3team-ask-user"),
  T3TeamAskUserWriterLive.pipe(Layer.provide(SqlitePersistenceMemory)),
);

/** A thread whose latest run is `running`, as it is while an agent calls MCP tools. */
const threadWithRunningRun = (threadId: ThreadId) =>
  Effect.gen(function* () {
    const orchestrator = yield* Orchestrator.OrchestratorV2;
    const projections = yield* ProjectionStore.ProjectionStoreV2;
    yield* createTestThread(threadId);
    yield* orchestrator.dispatch({
      type: "message.dispatch",
      commandId: CommandId.make(`start:${threadId}`),
      threadId,
      messageId: MessageId.make(`start:${threadId}`),
      text: "Plan the rollout",
      attachments: [],
      dispatchMode: { type: "start_immediately" },
      createdBy: "user",
      creationSource: "web",
    });
    const { runs } = yield* projections.getThreadRecords(threadId, ["runs"]);
    const run = runs.at(-1) as OrchestrationV2Run;
    yield* projections.apply({
      id: EventId.make(`running:${threadId}`),
      type: "run.updated",
      threadId,
      runId: run.id,
      occurredAt: yield* DateTime.now,
      payload: { ...run, status: "running", startedAt: yield* DateTime.now },
    });
    return run;
  });

const QUESTION =
  "Which of the two migration strategies should this thread follow for the billing tables?";

it.layer(TestLayer)("t3_ask_user on V2", (it) => {
  it.effect("records a pending message-mode question on the active run and returns", () =>
    Effect.gen(function* () {
      const projections = yield* ProjectionStore.ProjectionStoreV2;
      const threadId = ThreadId.make("thread:ask-record");
      const run = yield* threadWithRunningRun(threadId);

      const result = yield* t3TeamAskUser(
        { question: QUESTION, options: ["Blue-green", "In place"], multiSelect: true },
        threadId,
      );
      assert.strictEqual(result.delivered, true);

      const records = yield* projections.getThreadRecords(threadId, [
        "runtimeRequests",
        "nodes",
        "turnItems",
      ]);
      const request = records.runtimeRequests.find((entry) => entry.id === result.requestId);
      assert.strictEqual(request?.status, "pending");
      assert.strictEqual(request?.kind, "user_input");
      assert.deepStrictEqual(request?.responseCapability, { type: "message" });
      const node = records.nodes.find((entry) => entry.id === request?.nodeId);
      assert.strictEqual(node?.parentNodeId, run.rootNodeId);
      assert.strictEqual(node?.kind, "user_input_request");
      const item = records.turnItems.find((entry) => entry.type === "user_input_request");
      assert.ok(item?.type === "user_input_request");
      assert.strictEqual(item.requestId, result.requestId);
      assert.strictEqual(item.responseMode, "message");
      assert.strictEqual(item.runId, run.id);
      assert.strictEqual(item.questions[0]?.id, result.questionId);
      assert.strictEqual(item.questions[0]?.multiSelect, true);
    }),
  );

  it.effect("refuses a second question while one is pending, naming its requestId", () =>
    Effect.gen(function* () {
      const threadId = ThreadId.make("thread:ask-pending");
      yield* threadWithRunningRun(threadId);
      const first = yield* t3TeamAskUser({ question: QUESTION }, threadId);
      const second = yield* Effect.flip(t3TeamAskUser({ question: QUESTION }, threadId));
      assert.include(second.message, `requestId: ${first.requestId}`);
    }),
  );

  it.effect("needs an active turn and a non-empty question", () =>
    Effect.gen(function* () {
      const threadId = ThreadId.make("thread:ask-idle");
      yield* createTestThread(threadId);
      const idle = yield* Effect.flip(t3TeamAskUser({ question: QUESTION }, threadId));
      assert.include(idle.message, "only be called during an active turn");
      const empty = yield* Effect.flip(t3TeamAskUser({ question: "  " }, threadId));
      assert.include(empty.message, "non-empty 'question'");
    }),
  );

  it.effect("delivers a multi-select answer joined with a bullet and frees the slot", () =>
    Effect.gen(function* () {
      const orchestrator = yield* Orchestrator.OrchestratorV2;
      const projections = yield* ProjectionStore.ProjectionStoreV2;
      const threadId = ThreadId.make("thread:ask-answer");
      yield* threadWithRunningRun(threadId);
      const asked = yield* t3TeamAskUser(
        { question: QUESTION, options: ["Red, bold", "Blue"], multiSelect: true },
        threadId,
      );

      yield* orchestrator.dispatch({
        type: "runtime-request.respond",
        commandId: CommandId.make("answer:ask"),
        threadId,
        requestId: asked.requestId,
        answers: { [asked.questionId]: ["Red, bold", "Blue"] },
      });

      const records = yield* projections.getThreadRecords(threadId, [
        "runtimeRequests",
        "messages",
      ]);
      const request = records.runtimeRequests.find((entry) => entry.id === asked.requestId);
      assert.strictEqual(request?.status, "resolved");
      const answer = records.messages.find((message) => message.text.endsWith("Red, bold • Blue"));
      assert.strictEqual(answer?.text, `${QUESTION}\nRed, bold • Blue`);
      // The slot is free again for the next question.
      const next = yield* t3TeamAskUser({ question: QUESTION }, threadId);
      assert.notStrictEqual(next.requestId, asked.requestId);
    }),
  );
});
