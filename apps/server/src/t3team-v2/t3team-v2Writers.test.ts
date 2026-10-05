import { assert, it } from "@effect/vitest";
import { CommandId, MessageId, ThreadId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import * as Orchestrator from "../orchestration-v2/Orchestrator.ts";
import * as ProjectionStore from "../orchestration-v2/ProjectionStore.ts";
import { T3TeamThreadLineage } from "./t3team-threadLineage.ts";
import { recorderTurnItemId, T3TeamThreadMessageRecorder } from "./t3team-threadMessageRecorder.ts";
import { createTestThread, makeT3TeamV2TestLayer } from "./t3team-v2Orchestrator.testkit.ts";

it.layer(makeT3TeamV2TestLayer("t3team-v2-writers"))("t3team V2 writers", (it) => {
  it.effect("records run-less messages idempotently, after the latest run", () =>
    Effect.gen(function* () {
      const orchestrator = yield* Orchestrator.OrchestratorV2;
      const projections = yield* ProjectionStore.ProjectionStoreV2;
      const recorder = yield* T3TeamThreadMessageRecorder;
      const threadId = ThreadId.make("thread:recorder");
      yield* createTestThread(threadId);

      const early = yield* recorder.record({
        threadId,
        messageId: MessageId.make("t3team:note:early"),
        role: "system",
        text: "Before any run",
      });
      assert.isTrue(early.recorded);
      yield* orchestrator.dispatch({
        type: "message.dispatch",
        commandId: CommandId.make("dispatch:recorder"),
        threadId,
        messageId: MessageId.make("user-input"),
        text: "Do the thing",
        attachments: [],
        dispatchMode: { type: "defer_start" },
        createdBy: "user",
        creationSource: "web",
      });
      const noteId = MessageId.make("t3team:note:late");
      const note = { threadId, messageId: noteId, role: "assistant" as const, text: "Note" };
      assert.isTrue((yield* recorder.record(note)).recorded);
      assert.isFalse((yield* recorder.record(note)).recorded);
      assert.isTrue((yield* recorder.record({ ...note, text: "Edited note" })).recorded);

      const records = yield* projections.getThreadRecords(threadId, ["messages", "turnItems"]);
      const byId = new Map(records.turnItems.map((item) => [item.id, item]));
      const earlyItem = byId.get(early.turnItemId);
      const userItem = records.turnItems.find((item) => item.type === "user_message");
      const lateItem = byId.get(recorderTurnItemId(noteId));
      assert.strictEqual(earlyItem?.type, "system_notice");
      assert.ok(earlyItem && userItem && lateItem);
      assert.isBelow(earlyItem.ordinal, userItem.ordinal);
      assert.isAbove(lateItem.ordinal, userItem.ordinal);
      assert.strictEqual(
        lateItem.type === "assistant_message" ? lateItem.text : null,
        "Edited note",
      );
      const lateMessage = records.messages.find((message) => message.id === noteId);
      assert.strictEqual(lateMessage?.runId, null);
      assert.strictEqual(lateMessage?.createdBy, "agent");
      assert.strictEqual(records.messages.filter((message) => message.id === noteId).length, 1);
    }),
  );

  it.effect(
    "sets subagent lineage without bumping updatedAt and keeps children out of auto-settle",
    () =>
      Effect.gen(function* () {
        const projections = yield* ProjectionStore.ProjectionStoreV2;
        const lineage = yield* T3TeamThreadLineage;
        const parent = ThreadId.make("thread:lineage-parent");
        const child = ThreadId.make("thread:lineage-child");
        yield* createTestThread(parent, "Parent");
        yield* createTestThread(child, "Child");
        const before = yield* projections.getThread(child);
        const input = {
          threadId: child,
          parentThreadId: parent,
          relationshipToParent: "subagent" as const,
        };

        assert.isTrue(yield* lineage.setThreadLineage(input));
        assert.isFalse(yield* lineage.setThreadLineage(input));
        const after = yield* projections.getThread(child);
        assert.deepStrictEqual(after.lineage, {
          parentThreadId: parent,
          relationshipToParent: "subagent",
          rootThreadId: (yield* projections.getThread(parent)).lineage.rootThreadId,
        });
        assert.strictEqual(
          DateTime.toEpochMillis(after.updatedAt),
          DateTime.toEpochMillis(before.updatedAt),
        );

        const cycle = yield* Effect.exit(
          lineage.setThreadLineage({
            threadId: parent,
            parentThreadId: child,
            relationshipToParent: "subagent",
          }),
        );
        assert.strictEqual(cycle._tag, "Failure");
        const self = yield* Effect.exit(
          lineage.setThreadLineage({
            threadId: child,
            parentThreadId: child,
            relationshipToParent: "fork",
          }),
        );
        assert.strictEqual(self._tag, "Failure");

        const candidates = (yield* projections.getSettlementCandidates()).map(
          (thread) => thread.id,
        );
        assert.include(candidates, parent);
        assert.notInclude(candidates, child);
      }),
  );
});
