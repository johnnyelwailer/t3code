import { assert, it } from "@effect/vitest";
import { CommandId, EventId, MessageId, ThreadId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as EventSink from "./orchestration-v2/EventSink.ts";
import * as Orchestrator from "./orchestration-v2/Orchestrator.ts";
import * as ThreadManagementService from "./orchestration-v2/ThreadManagementService.ts";
import { layerMemory as SqlitePersistenceMemory } from "./persistence/Sqlite.ts";
import { T3TeamActorMailboxStore, T3TeamActorMailboxStoreLive } from "./t3team-actorMailbox.ts";
import { T3TeamActorMailbox } from "./t3team-actorMailboxService.ts";
import { T3TeamActorMessageReactor } from "./t3team-actorMessageReactor.ts";
import {
  createTestThread,
  makeT3TeamV2TestLayer,
} from "./t3team-v2/t3team-v2Orchestrator.testkit.ts";

const TestLayer = Layer.mergeAll(
  ThreadManagementService.layer.pipe(
    Layer.provideMerge(makeT3TeamV2TestLayer("t3team-actor-message-reactor")),
  ),
  T3TeamActorMailboxStoreLive.pipe(Layer.provide(SqlitePersistenceMemory)),
);

const userMessage = (threadId: ThreadId, id: string) =>
  Effect.flatMap(Orchestrator.OrchestratorV2, (orchestrator) =>
    orchestrator.dispatch({
      type: "message.dispatch",
      commandId: CommandId.make(`dispatch:${id}`),
      threadId,
      messageId: MessageId.make(id),
      text: "typed by the user",
      attachments: [],
      dispatchMode: { type: "defer_start" },
      createdBy: "user",
      creationSource: "web",
    }),
  );

it.layer(TestLayer)("t3team actor message reactor", (it) => {
  it.effect("reacts to the live tail only: a boot never replays history over current holds", () =>
    Effect.gen(function* () {
      const store = yield* T3TeamActorMailboxStore;
      const stopped = ThreadId.make("reactor:stopped");
      const live = ThreadId.make("reactor:live");
      yield* createTestThread(stopped, "Stopped");
      yield* createTestThread(live, "Live");
      // History: the user wrote to the thread, later stopped it (a durable hold).
      yield* userMessage(stopped, "reactor:history");
      yield* store.hold(stopped, "2026-10-03T10:00:00.000Z");

      const drained: string[] = [];
      const liveDrained = yield* Deferred.make<void>();
      const mailbox = Layer.succeed(
        T3TeamActorMailbox,
        T3TeamActorMailbox.of({
          store,
          send: () => Effect.die("unused"),
          drain: (threadId) =>
            Effect.sync(() => drained.push(threadId)).pipe(
              Effect.andThen(
                threadId === live ? Deferred.succeed(liveDrained, undefined) : Effect.void,
              ),
              Effect.as({ state: "waiting" as const, pending: [] }),
            ),
        }),
      );
      // Started after the history exists, over the harness's own sink (the orchestrator's).
      const context = yield* Effect.context<
        ThreadManagementService.ThreadManagementService | EventSink.EventSinkV2
      >();
      yield* Layer.build(
        T3TeamActorMessageReactor.pipe(
          Layer.provide(mailbox),
          Layer.provide(Layer.succeedContext(context)),
        ),
      );

      // V1 history hydrated after boot (importer events) is not "the user wrote again".
      const importedAt = DateTime.makeUnsafe("2025-06-01T00:00:00.000Z");
      yield* (yield* EventSink.EventSinkV2).write({
        events: [
          {
            id: EventId.make("migration:v1:message:reactor:v1-user"),
            type: "message.updated",
            threadId: stopped,
            occurredAt: importedAt,
            payload: {
              createdBy: "user",
              creationSource: "server",
              id: MessageId.make("reactor:v1-user"),
              threadId: stopped,
              runId: null,
              nodeId: null,
              role: "user",
              text: "written on V1",
              attachments: [],
              streaming: false,
              createdAt: importedAt,
              updatedAt: importedAt,
            },
          },
        ],
      });
      // A live user message is handled after anything the reactor would replay first.
      yield* userMessage(live, "reactor:live-message");
      yield* Deferred.await(liveDrained);

      assert.deepStrictEqual(drained, [live]);
      assert.deepStrictEqual(yield* store.heldThreads(), [stopped]);
    }).pipe(Effect.scoped),
  );
});
