import { assert, it } from "@effect/vitest";
import { MessageId, readT3TeamMessageExtContext, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import * as ProjectionStore from "./orchestration-v2/ProjectionStore.ts";
import { recordWorkflowReply } from "./t3team-thread-recipe-workflow-reply.ts";
import {
  createTestThread,
  makeT3TeamV2TestLayer,
} from "./t3team-v2/t3team-v2Orchestrator.testkit.ts";

it.layer(makeT3TeamV2TestLayer("t3team-workflow-reply"))("workflow reply", (it) => {
  it.effect("lands as the person's run-less message carrying the structured reply", () =>
    Effect.gen(function* () {
      const projections = yield* ProjectionStore.ProjectionStoreV2;
      const threadId = ThreadId.make("thread:workflow-reply");
      yield* createTestThread(threadId);
      const reply = {
        threadId,
        messageId: MessageId.make("reply-1"),
        text: "Hold",
        workflowReply: { value: "hold", correlationId: "run-1:3" },
      };

      assert.isTrue((yield* recordWorkflowReply(reply)).recorded);
      // A retried click with the same optimistic id stays one reply.
      assert.isFalse((yield* recordWorkflowReply(reply)).recorded);

      const records = yield* projections.getThreadRecords(threadId, ["messages", "runs"]);
      const message = records.messages.find((entry) => entry.id === reply.messageId);
      assert.strictEqual(message?.role, "user");
      assert.strictEqual(message?.createdBy, "user");
      assert.strictEqual(message?.text, "Hold");
      assert.deepStrictEqual(readT3TeamMessageExtContext(message?.context)?.workflowReply, {
        value: "hold",
        correlationId: "run-1:3",
      });
      // The answer is for the workflow: no agent run was started for it.
      assert.strictEqual(records.runs.length, 0);
    }),
  );

  it.effect("a plain-text reply carries no workflow ext", () =>
    Effect.gen(function* () {
      const projections = yield* ProjectionStore.ProjectionStoreV2;
      const threadId = ThreadId.make("thread:workflow-reply-text");
      yield* createTestThread(threadId);
      const messageId = MessageId.make("reply-text");

      yield* recordWorkflowReply({ threadId, messageId, text: "Ship it" });

      const records = yield* projections.getThreadRecords(threadId, ["messages"]);
      const message = records.messages.find((entry) => entry.id === messageId);
      assert.strictEqual(message?.text, "Ship it");
      assert.isUndefined(readT3TeamMessageExtContext(message?.context)?.workflowReply);
    }),
  );
});
