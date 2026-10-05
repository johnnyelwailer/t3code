import { assert, it } from "@effect/vitest";
import {
  EventId,
  MessageId,
  NodeId,
  ProviderInstanceId,
  RunAttemptId,
  RunId,
  ThreadId,
  TurnItemId,
  type OrchestrationV2ConversationMessage,
  type OrchestrationV2DomainEvent,
  type OrchestrationV2Run,
  type OrchestrationV2TurnItem,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import { delegatedCompletionWakeDetail } from "../orchestration-v2/Orchestrator.ts";
import type { DelegatedCompletionWakeRendererShape } from "./t3team-delegatedCompletionWakeRenderer.ts";
import {
  type DelegatedCompletionWakeRefreshInput,
  refreshStartingDelegatedCompletionWake,
} from "./t3team-delegatedCompletionWakeRefresh.ts";

const now = DateTime.makeUnsafe("2026-10-04T12:00:00Z");
const threadId = ThreadId.make("thread:wake-refresh");
const runId = RunId.make("run:wake-refresh");
const messageId = MessageId.make("message:wake-refresh");
const taskIds = [NodeId.make("task:a"), NodeId.make("task:b")];
const instanceId = ProviderInstanceId.make("codex");

const run: OrchestrationV2Run = {
  id: runId,
  threadId,
  ordinal: 3,
  providerInstanceId: instanceId,
  modelSelection: { instanceId, model: "gpt-5.4" },
  providerThreadId: null,
  userMessageId: messageId,
  rootNodeId: NodeId.make("node:wake-refresh-root"),
  activeAttemptId: RunAttemptId.make("attempt:wake-refresh"),
  status: "starting",
  requestedAt: now,
  startedAt: null,
  completedAt: null,
  checkpointId: null,
  contextHandoffId: null,
};

const wakeMessage = (text: string): OrchestrationV2ConversationMessage => ({
  id: messageId,
  threadId,
  runId,
  nodeId: run.rootNodeId,
  role: "user",
  text,
  attachments: [],
  streaming: false,
  createdBy: "agent",
  creationSource: "server",
  createdAt: now,
  updatedAt: now,
  delegatedCompletion: { parentRunId: RunId.make("run:parent"), generation: 1, taskIds },
});

const userTurnItem = (text: string): OrchestrationV2TurnItem => ({
  id: TurnItemId.make("turn-item:wake-refresh-user"),
  threadId,
  runId,
  nodeId: run.rootNodeId,
  providerThreadId: null,
  providerTurnId: null,
  nativeItemRef: null,
  parentItemId: null,
  ordinal: 300,
  status: "completed",
  title: null,
  startedAt: now,
  completedAt: now,
  updatedAt: now,
  type: "user_message",
  messageId,
  inputIntent: "queued_turn",
  text,
  attachments: [],
  createdBy: "agent",
  creationSource: "server",
});

const richRenderer: DelegatedCompletionWakeRendererShape = {
  render: (wake) => Effect.succeed(`Children finished: ${wake.taskIds.join(" and ")} — all green.`),
};

const harness = (input: {
  readonly message: OrchestrationV2ConversationMessage | undefined;
  readonly renderer?: DelegatedCompletionWakeRendererShape;
  readonly committed?: boolean;
}) => {
  const writes: Array<ReadonlyArray<OrchestrationV2DomainEvent>> = [];
  const expectations: Array<{ readonly status: string; readonly attemptId: string }> = [];
  let renders = 0;
  let nextEvent = 0;
  const renderer = input.renderer ?? { render: (wake) => Effect.succeed(wake.defaultText) };
  const refreshInput: DelegatedCompletionWakeRefreshInput = {
    renderer: {
      render: (wake) => Effect.suspend(() => ((renders += 1), renderer.render(wake))),
    },
    eventSink: {
      writeIfRunCurrent: (write) =>
        Effect.sync(() => {
          writes.push(write.events);
          expectations.push({ status: write.expectedStatus, attemptId: write.activeAttemptId });
          return { committed: input.committed ?? true, storedEvents: [] };
        }),
    },
    ids: { event: () => Effect.sync(() => EventId.make(`event:wake-refresh:${(nextEvent += 1)}`)) },
    turnItems: [userTurnItem(input.message?.text ?? "")],
    run,
    message: input.message,
  };
  return {
    refresh: refreshStartingDelegatedCompletionWake(refreshInput),
    writes,
    expectations,
    renders: () => renders,
  };
};

it.effect("renders a merged wake for its final task set and stores the text it delivers", () =>
  Effect.gen(function* () {
    const test = harness({
      message: wakeMessage(delegatedCompletionWakeDetail(taskIds)),
      renderer: richRenderer,
    });
    const delivered = yield* test.refresh;

    const rendered = "Children finished: task:a and task:b — all green.";
    assert.strictEqual(delivered?.text, rendered);
    assert.deepStrictEqual(test.expectations, [
      { status: "starting", attemptId: "attempt:wake-refresh" },
    ]);
    const [events] = test.writes;
    assert.deepStrictEqual(
      events?.map((event) => event.type),
      ["message.updated", "turn-item.updated"],
    );
    for (const event of events ?? []) {
      assert.strictEqual(
        event.type === "message.updated" || event.type === "turn-item.updated"
          ? (event.payload as { readonly text: string }).text
          : undefined,
        rendered,
      );
    }
  }),
);

it.effect("leaves a wake already rendered for its cohort untouched", () =>
  Effect.gen(function* () {
    const message = wakeMessage("Task a failed: tests broke. Task b completed.");
    const test = harness({ message, renderer: richRenderer });

    assert.strictEqual(yield* test.refresh, message);
    assert.strictEqual(test.renders(), 0);
    assert.deepStrictEqual(test.writes, []);
  }),
);

it.effect("writes nothing without a renderer override", () =>
  Effect.gen(function* () {
    const message = wakeMessage(delegatedCompletionWakeDetail(taskIds));
    const test = harness({ message });

    assert.strictEqual(yield* test.refresh, message);
    assert.strictEqual(test.renders(), 1);
    assert.deepStrictEqual(test.writes, []);
  }),
);

it.effect("delivers the stored text when the run moved on before the write", () =>
  Effect.gen(function* () {
    const message = wakeMessage(delegatedCompletionWakeDetail(taskIds));
    const test = harness({ message, renderer: richRenderer, committed: false });

    assert.strictEqual(yield* test.refresh, message);
    assert.strictEqual(test.writes.length, 1);
  }),
);

it.effect("passes ordinary messages through without rendering", () =>
  Effect.gen(function* () {
    const { delegatedCompletion: _omitted, ...plain } = wakeMessage("Please continue.");
    const test = harness({ message: plain, renderer: richRenderer });

    assert.strictEqual(yield* test.refresh, plain);
    assert.strictEqual(yield* harness({ message: undefined }).refresh, undefined);
    assert.strictEqual(test.renders(), 0);
  }),
);
