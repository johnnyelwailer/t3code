import {
  CommandId,
  EventId,
  MessageId,
  type OrchestrationEvent,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import {
  matchesEventReplayFilters,
  type OrchestrationEventReplayFilter,
} from "../../orchestration/t3team-eventReplayFilter.ts";
import { OrchestrationEventStore } from "../Services/OrchestrationEventStore.ts";
import { OrchestrationEventStoreLive } from "./OrchestrationEventStore.ts";
import { SqlitePersistenceMemory } from "./Sqlite.ts";

const layer = it.layer(
  OrchestrationEventStoreLive.pipe(Layer.provideMerge(SqlitePersistenceMemory)),
);
const at = "2026-09-29T10:00:00.000Z";
const threadId = ThreadId.make("thread-read-matching");

let id = 0;
function envelope() {
  id += 1;
  return {
    eventId: EventId.make(`evt-${id}`),
    aggregateKind: "thread" as const,
    aggregateId: threadId,
    occurredAt: at,
    commandId: CommandId.make(`cmd-${id}`),
    causationEventId: null,
    correlationId: null,
    metadata: {},
  };
}
const message = (role: "user" | "assistant") => ({
  ...envelope(),
  type: "thread.message-sent" as const,
  payload: {
    threadId,
    messageId: MessageId.make(`msg-${id}`),
    role,
    text: `${role} text`,
    turnId: null,
    streaming: false,
    createdAt: at,
    updatedAt: at,
  },
});
const activity = (kind: string) => ({
  ...envelope(),
  type: "thread.activity-appended" as const,
  payload: {
    threadId,
    activity: {
      id: EventId.make(`activity-${id}`),
      tone: "info" as const,
      kind,
      summary: kind,
      payload: {},
      turnId: null,
      createdAt: at,
    },
  },
});
const sessionSet = () => ({
  ...envelope(),
  type: "thread.session-set" as const,
  payload: {
    threadId,
    session: {
      threadId,
      status: "ready" as const,
      providerName: "codex",
      providerInstanceId: ProviderInstanceId.make("codex"),
      runtimeMode: "full-access" as const,
      activeTurnId: null,
      lastError: null,
      updatedAt: at,
    },
  },
});

const filters: ReadonlyArray<OrchestrationEventReplayFilter> = [
  { type: "thread.session-set" },
  { type: "thread.message-sent", messageRole: "user" },
  { type: "thread.activity-appended", activityKinds: ["t3team.child_wait.registered"] },
];

layer("OrchestrationEventStore.readMatching", (it) => {
  it.effect("returns exactly the events the in-memory predicate matches, across pages", () =>
    Effect.gen(function* () {
      const store = yield* OrchestrationEventStore;
      // More than one 500-row page, with matches spread across the page boundary.
      for (let index = 0; index < 1_200; index += 1) {
        const pick = index % 6;
        yield* store.append(
          pick === 0
            ? message("user")
            : pick === 1
              ? activity("t3team.child_wait.registered")
              : pick === 2
                ? activity("tool.updated")
                : pick === 3
                  ? sessionSet()
                  : message("assistant"),
        );
      }

      const all: ReadonlyArray<OrchestrationEvent> = Array.from(
        yield* Stream.runCollect(store.readAll()),
      );
      const matched = Array.from(yield* Stream.runCollect(store.readMatching!(filters)));

      const expected = all.filter((event) => matchesEventReplayFilters(event, filters));
      assert.strictEqual(expected.length, 600);
      assert.deepStrictEqual(
        matched.map((event) => event.sequence),
        expected.map((event) => event.sequence),
      );
      assert.deepStrictEqual(Array.from(yield* Stream.runCollect(store.readMatching!([]))), []);
      // Reactors union their collectors' filters, so the same class can be asked for twice.
      const overlapping = Array.from(
        yield* Stream.runCollect(store.readMatching!([...filters, ...filters])),
      );
      assert.deepStrictEqual(
        overlapping.map((event) => event.sequence),
        expected.map((event) => event.sequence),
      );
    }),
  );
});
