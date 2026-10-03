import { assert, it } from "@effect/vitest";
import {
  DEFAULT_SERVER_SETTINGS,
  MessageId,
  type OrchestrationV2DomainEvent,
  type OrchestrationV2ThreadShell,
  RunId,
  ThreadId,
  TurnItemId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import * as Stream from "effect/Stream";

import { ThreadManagementService } from "./orchestration-v2/ThreadManagementService.ts";
import { SqlitePersistenceMemory } from "./persistence/Layers/Sqlite.ts";
import * as ServerSettings from "./serverSettings.ts";
import { TextGeneration } from "./textGeneration/TextGeneration.ts";
import {
  makeT3TeamActivityLabelReactor,
  parseActivityLabelTtlMs,
} from "./t3team-activityLabelReactor.ts";
import * as ThreadFactsStore from "./t3team-v2/t3team-threadFactsStore.ts";
import { testModelSelection } from "./t3team-v2/t3team-v2Orchestrator.testkit.ts";

const at = DateTime.makeUnsafe("2026-01-01T00:00:00.000Z");
const threadId = ThreadId.make("thread:activity-label");

const commandItem = (input: string): OrchestrationV2DomainEvent =>
  ({
    type: "turn-item.updated",
    threadId,
    payload: {
      id: TurnItemId.make(`item:${input}`),
      threadId,
      runId: RunId.make("run:1"),
      nodeId: null,
      providerTurnId: null,
      parentItemId: null,
      ordinal: 1,
      status: "completed",
      title: null,
      startedAt: at,
      completedAt: at,
      updatedAt: at,
      type: "command_execution",
      input,
    },
  }) as never;

const userMessage = (text: string): OrchestrationV2DomainEvent =>
  ({
    type: "message.updated",
    threadId,
    payload: { id: MessageId.make("msg:1"), threadId, role: "user", text, streaming: false },
  }) as never;

/** Polls in real time (`it.live`): the summarizer runs on real timers, not the test clock. */
const waitFor = <E, R>(check: Effect.Effect<boolean, E, R>) =>
  Effect.gen(function* () {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      if (yield* check) return;
      yield* Effect.sleep("10 millis");
    }
    return yield* Effect.die(new Error("condition not reached"));
  });

const runTerminal: OrchestrationV2DomainEvent = {
  type: "run.updated",
  threadId,
  payload: { id: RunId.make("run:1"), threadId, status: "completed" },
} as never;

it.live("labels a thread from finished turn items and clears it when the run ends", () =>
  Effect.gen(function* () {
    const events = yield* PubSub.unbounded<OrchestrationV2DomainEvent>();
    const contexts: string[] = [];
    const Mocks = Layer.mergeAll(
      Layer.mock(ThreadManagementService)({
        streamDomainEvents: Stream.fromPubSub(events),
        getThreadShell: () =>
          Effect.succeed({
            id: threadId,
            projectId: "project-1",
            modelSelection: testModelSelection,
          } as unknown as OrchestrationV2ThreadShell),
      }),
      Layer.mock(TextGeneration)({
        generateActivityLabel: (input) =>
          Effect.sync(() => {
            contexts.push(input.context);
            return { label: "Running the test suite" };
          }),
      }),
      Layer.succeed(ServerSettings.ServerSettingsService, {
        getSettings: Effect.succeed({
          ...DEFAULT_SERVER_SETTINGS,
          t3teamActivityLabelsEnabled: true,
        }),
        streamChanges: Stream.never,
      } as never),
    );
    const facts = yield* ThreadFactsStore.T3TeamThreadFactsStore;
    const labelIs = (label: string | null) =>
      facts.get(threadId).pipe(Effect.map((record) => record?.activityLabel === label));
    yield* makeT3TeamActivityLabelReactor({
      debounceMs: 0,
      minRegenerateMs: 0,
      activityLabelTtlMs: 0,
    }).pipe(Effect.provide(Mocks));
    // Let the forked stream subscribe before publishing (a PubSub drops earlier events).
    yield* Effect.sleep("20 millis");

    yield* PubSub.publish(events, userMessage("Please   fix the flaky test"));
    yield* PubSub.publish(events, commandItem("pnpm test"));
    yield* waitFor(labelIs("Running the test suite"));
    assert.include(contexts[0], "pnpm test");
    assert.include(contexts[0], "Please fix the flaky test");

    yield* PubSub.publish(events, runTerminal);
    yield* waitFor(labelIs(null));
  }).pipe(
    Effect.provide(ThreadFactsStore.layer.pipe(Layer.provideMerge(SqlitePersistenceMemory))),
    Effect.scoped,
  ),
);

it("parses the label TTL override strictly", () => {
  assert.strictEqual(parseActivityLabelTtlMs("0"), 0);
  assert.strictEqual(parseActivityLabelTtlMs("1500"), 1500);
  assert.isUndefined(parseActivityLabelTtlMs("-1"));
  assert.isUndefined(parseActivityLabelTtlMs("soon"));
  assert.isUndefined(parseActivityLabelTtlMs(undefined));
});
