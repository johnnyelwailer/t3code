import {
  CommandId,
  EventId,
  MessageId,
  type OrchestrationEvent,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  TurnId,
} from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { ServerConfig } from "../../config.ts";
import * as RepositoryIdentityResolver from "../../project/RepositoryIdentityResolver.ts";
import { OrchestrationEventStoreLive } from "../../persistence/Layers/OrchestrationEventStore.ts";
import { SqlitePersistenceMemory } from "../../persistence/Layers/Sqlite.ts";
import { OrchestrationEventStore } from "../../persistence/Services/OrchestrationEventStore.ts";
import { OrchestrationProjectionPipeline } from "../Services/ProjectionPipeline.ts";
import { ProjectionSnapshotQuery } from "../Services/ProjectionSnapshotQuery.ts";
import * as ThreadBackgroundLiveness from "../ThreadBackgroundLiveness.ts";
import * as ThreadPlanProgress from "../ThreadPlanProgress.ts";
import { OrchestrationProjectionPipelineLive } from "./ProjectionPipeline.ts";
import { OrchestrationProjectionSnapshotQueryLive } from "./ProjectionSnapshotQuery.ts";

// The shell must carry what list rows need, so no row reads a thread's detail
// (which opened a subscribeThread stream per row, 2026-09-29).
const layer = it.layer(
  Layer.fresh(
    OrchestrationProjectionSnapshotQueryLive.pipe(
      Layer.provide(ThreadBackgroundLiveness.layer),
      Layer.provide(ThreadPlanProgress.layer),
      Layer.provide(RepositoryIdentityResolver.layer),
      Layer.provideMerge(OrchestrationProjectionPipelineLive),
      Layer.provideMerge(OrchestrationEventStoreLive),
      Layer.provideMerge(SqlitePersistenceMemory),
      Layer.provideMerge(
        ServerConfig.layerTest(process.cwd(), { prefix: "t3-shell-t3team-facts-" }),
      ),
      Layer.provideMerge(NodeServices.layer),
    ),
  ),
);

const at = "2026-09-29T10:00:00.000Z";

function envelope(threadId: ThreadId, id: string) {
  return {
    eventId: EventId.make(`evt-${id}`),
    aggregateKind: "thread" as const,
    aggregateId: threadId,
    occurredAt: at,
    commandId: CommandId.make(`cmd-${id}`),
    causationEventId: null,
    correlationId: CommandId.make(`cmd-${id}`),
    metadata: {},
  };
}

function threadCreated(threadId: ThreadId) {
  return {
    ...envelope(threadId, `create-${threadId}`),
    type: "thread.created" as const,
    payload: {
      threadId,
      projectId: ProjectId.make("project-shell-facts"),
      title: "Shell facts",
      modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5" },
      runtimeMode: "full-access" as const,
      interactionMode: "default" as const,
      branch: null,
      worktreePath: null,
      createdAt: at,
      updatedAt: at,
    },
  };
}

function childWait(
  threadId: ThreadId,
  kind: "registered" | "resolved",
  waitId: string,
  turnId: string | null = null,
) {
  return {
    ...envelope(threadId, `wait-${kind}-${waitId}`),
    type: "thread.activity-appended" as const,
    payload: {
      threadId,
      activity: {
        id: EventId.make(`activity-wait-${kind}-${waitId}`),
        tone: "info" as const,
        kind: `t3team.child_wait.${kind}`,
        summary: `Child wait ${kind}`,
        payload: { waitId, childThreadId: "child-thread" },
        turnId: turnId === null ? null : TurnId.make(turnId),
        createdAt: at,
      },
    },
  };
}

function messageSent(threadId: ThreadId, messageId: string) {
  return {
    ...envelope(threadId, `message-${messageId}`),
    type: "thread.message-sent" as const,
    payload: {
      threadId,
      messageId: MessageId.make(messageId),
      role: "user" as const,
      text: "hello",
      turnId: null,
      streaming: false,
      createdAt: at,
      updatedAt: at,
    },
  };
}

function threadDeleted(threadId: ThreadId) {
  return {
    ...envelope(threadId, `delete-${threadId}`),
    type: "thread.deleted" as const,
    payload: { threadId, deletedAt: at },
  };
}

function threadReverted(threadId: ThreadId, turnCount: number) {
  return {
    ...envelope(threadId, `revert-${threadId}-${turnCount}`),
    type: "thread.reverted" as const,
    payload: { threadId, turnCount },
  };
}

const project = Effect.fn(function* (event: Omit<OrchestrationEvent, "sequence">) {
  const eventStore = yield* OrchestrationEventStore;
  const pipeline = yield* OrchestrationProjectionPipeline;
  yield* pipeline.projectEvent(yield* eventStore.append(event as never));
});

const readShell = Effect.fn(function* (threadId: ThreadId) {
  const query = yield* ProjectionSnapshotQuery;
  return Option.getOrThrow(yield* query.getThreadShellById(threadId));
});

layer("thread shell t3team facts", (it) => {
  it.effect("hasOpenChildWait follows the open set of registered/resolved waits", () =>
    Effect.gen(function* () {
      const threadId = ThreadId.make("thread-child-wait");
      yield* project(threadCreated(threadId));
      assert.strictEqual((yield* readShell(threadId)).hasOpenChildWait, undefined);

      yield* project(childWait(threadId, "registered", "wait-1"));
      yield* project(childWait(threadId, "registered", "wait-2"));
      assert.strictEqual((yield* readShell(threadId)).hasOpenChildWait, true);

      yield* project(childWait(threadId, "resolved", "wait-1"));
      assert.strictEqual((yield* readShell(threadId)).hasOpenChildWait, true);

      yield* project(childWait(threadId, "resolved", "wait-2"));
      assert.strictEqual((yield* readShell(threadId)).hasOpenChildWait, undefined);
    }),
  );

  it.effect("localSessionInstanceId comes from mirrored local: message ids only", () =>
    Effect.gen(function* () {
      const appThread = ThreadId.make("thread-app-managed");
      yield* project(threadCreated(appThread));
      yield* project(messageSent(appThread, "msg-app-1"));
      assert.strictEqual((yield* readShell(appThread)).localSessionInstanceId, undefined);

      const mirrored = ThreadId.make("thread-mirrored");
      yield* project(threadCreated(mirrored));
      yield* project(messageSent(mirrored, "local:claudeAgent:native-1:0"));
      yield* project(messageSent(mirrored, "local:codex:native-1:1"));
      // First recorded wins; an unknown instance never lands on the shell.
      assert.strictEqual(
        (yield* readShell(mirrored)).localSessionInstanceId,
        ProviderInstanceId.make("claudeAgent"),
      );

      const unknown = ThreadId.make("thread-unknown-local");
      yield* project(threadCreated(unknown));
      yield* project(messageSent(unknown, "local:someoneElse:native:0"));
      assert.strictEqual((yield* readShell(unknown)).localSessionInstanceId, undefined);
    }),
  );

  it.effect("a thread re-created under the same id does not inherit the old facts", () =>
    Effect.gen(function* () {
      const threadId = ThreadId.make("thread-recreated");
      yield* project(threadCreated(threadId));
      yield* project(childWait(threadId, "registered", "wait-old"));
      yield* project(messageSent(threadId, "local:codex:native-old:0"));
      const before = yield* readShell(threadId);
      assert.strictEqual(before.hasOpenChildWait, true);
      assert.strictEqual(before.localSessionInstanceId, ProviderInstanceId.make("codex"));

      yield* project(threadDeleted(threadId));
      yield* project({ ...threadCreated(threadId), eventId: EventId.make("evt-recreate") });
      const after = yield* readShell(threadId);
      assert.strictEqual(after.hasOpenChildWait, undefined);
      assert.strictEqual(after.localSessionInstanceId, undefined);
    }),
  );

  it.effect("a revert that drops a child-wait registration clears the flag", () =>
    Effect.gen(function* () {
      const threadId = ThreadId.make("thread-reverted");
      yield* project(threadCreated(threadId));
      yield* project(childWait(threadId, "registered", "wait-in-turn", "turn-reverted"));
      assert.strictEqual((yield* readShell(threadId)).hasOpenChildWait, true);

      yield* project(threadReverted(threadId, 0));
      assert.strictEqual((yield* readShell(threadId)).hasOpenChildWait, undefined);
    }),
  );
});
