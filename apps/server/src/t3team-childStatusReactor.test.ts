import { assert, it } from "@effect/vitest";
import {
  type OrchestrationV2DomainEvent,
  type OrchestrationV2ThreadShell,
  RunId,
  ThreadId,
  TurnItemId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import { TestClock } from "effect/testing";

import { ThreadManagementService } from "./orchestration-v2/ThreadManagementService.ts";
import { SqlitePersistenceMemory } from "./persistence/Layers/Sqlite.ts";
import { TextGeneration } from "./textGeneration/TextGeneration.ts";
import { T3TeamChildStatusReactorLive } from "./t3team-childStatusReactor.ts";
import * as ThreadFactsStore from "./t3team-v2/t3team-threadFactsStore.ts";
import { testModelSelection } from "./t3team-v2/t3team-v2Orchestrator.testkit.ts";

const at = DateTime.makeUnsafe("2026-01-01T00:00:00.000Z");
const child = ThreadId.make("thread:status-child");
const native = ThreadId.make("thread:status-native");
const root = ThreadId.make("thread:status-root");

const commandEvent = (threadId: ThreadId, input: string): OrchestrationV2DomainEvent =>
  ({
    type: "turn-item.updated",
    threadId,
    payload: {
      id: TurnItemId.make(`item:${threadId}:${input}`),
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

const shellOf = (
  threadId: ThreadId,
  parent: ThreadId | null,
  creationSource: OrchestrationV2ThreadShell["creationSource"] = "mcp",
) =>
  ({
    id: threadId,
    creationSource,
    modelSelection: testModelSelection,
    lineage: {
      parentThreadId: parent,
      relationshipToParent: parent === null ? null : "subagent",
      rootThreadId: parent ?? threadId,
    },
  }) as unknown as OrchestrationV2ThreadShell;

const prompts: string[] = [];
const Mocks = Layer.mergeAll(
  Layer.mock(ThreadManagementService)({
    streamDomainEvents: Stream.fromIterable([
      commandEvent(root, "echo root"),
      commandEvent(native, "grep -r provider"),
      commandEvent(child, "pnpm test"),
    ]),
    getThreadShell: (threadId) =>
      Effect.succeed(
        threadId === child
          ? shellOf(child, root)
          : threadId === native
            ? shellOf(native, root, "provider")
            : shellOf(root, null),
      ),
  }),
  Layer.mock(TextGeneration)({
    generateStructured: (input) =>
      Effect.sync(() => {
        prompts.push(input.prompt);
        return { status: "Running the test suite" } as never;
      }),
  }),
);

const TestLayer = ThreadFactsStore.layer.pipe(Layer.provideMerge(SqlitePersistenceMemory));

it.layer(TestLayer)("T3TeamChildStatusReactorLive", (it) => {
  it.effect("writes a debounced childStatus fact for app-owned subagent children only", () =>
    Effect.gen(function* () {
      const facts = yield* ThreadFactsStore.T3TeamThreadFactsStore;
      yield* Layer.build(T3TeamChildStatusReactorLive.pipe(Layer.provide(Mocks)));
      yield* TestClock.adjust("2 seconds");
      assert.strictEqual((yield* facts.get(child))?.childStatus, "Running the test suite");
      assert.isNull(yield* facts.get(root));
      // A provider-native subagent (hidden, inside the parent's turn) costs no model call.
      assert.isNull(yield* facts.get(native));
      assert.strictEqual(prompts.length, 1);
      assert.include(prompts[0], "command_execution: pnpm test");
    }).pipe(Effect.scoped),
  );
});
