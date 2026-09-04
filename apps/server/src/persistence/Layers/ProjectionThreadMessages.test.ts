import { MessageId, ThreadId } from "@t3tools/contracts";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { ProjectionThreadMessageRepository } from "../Services/ProjectionThreadMessages.ts";
import { ProjectionThreadMessageRepositoryLive } from "./ProjectionThreadMessages.ts";
import { SqlitePersistenceMemory } from "./Sqlite.ts";

const layer = it.layer(
  ProjectionThreadMessageRepositoryLive.pipe(Layer.provideMerge(SqlitePersistenceMemory)),
);

layer("ProjectionThreadMessageRepository", (it) => {
  // GHE #416: a reply first written by the streaming path, then completed by upsert, must take a
  // sequence AFTER its prompt — the list is `ORDER BY sequence`, and a NULL sorted it first.
  it.effect("assigns a sequence to a streamed reply so it lists after its prompt", () =>
    Effect.gen(function* () {
      const repository = yield* ProjectionThreadMessageRepository;
      const threadId = ThreadId.make("thread-sequence-streamed");
      const prompt = MessageId.make("message-sequence-prompt");
      const reply = MessageId.make("message-sequence-reply");
      const base = {
        threadId,
        turnId: null,
        createdAt: "2026-09-03T15:11:21.000Z",
        updatedAt: "2026-09-03T15:11:21.000Z",
      };
      yield* repository.upsert({
        ...base,
        messageId: prompt,
        role: "user",
        text: "prompt",
        isStreaming: false,
      });
      yield* repository.appendStreaming({
        messageId: reply,
        threadId,
        turnId: null,
        role: "assistant",
        text: "the ",
        createdAt: "2026-09-03T15:11:30.000Z",
        updatedAt: "2026-09-03T15:11:30.000Z",
      });
      yield* repository.upsert({
        ...base,
        messageId: reply,
        role: "assistant",
        text: "the answer",
        isStreaming: false,
        createdAt: "2026-09-03T15:11:30.000Z",
        updatedAt: "2026-09-03T15:11:53.000Z",
      });
      const listed = yield* repository.listByThreadId({ threadId });
      assert.deepStrictEqual(
        listed.map((row) => row.messageId),
        [prompt, reply],
      );
    }),
  );

  it.effect("appends streaming text and applies attachment updates", () =>
    Effect.gen(function* () {
      const repository = yield* ProjectionThreadMessageRepository;
      const threadId = ThreadId.make("thread-streaming-append");
      const messageId = MessageId.make("message-streaming-append");
      const createdAt = "2026-02-28T19:05:00.000Z";
      const attachments = [
        {
          type: "image" as const,
          id: "thread-streaming-append-att-1",
          name: "example.png",
          mimeType: "image/png",
          sizeBytes: 5,
        },
      ];

      yield* repository.appendStreaming({
        messageId,
        threadId,
        turnId: null,
        role: "assistant",
        text: "hello",
        attachments,
        createdAt,
        updatedAt: createdAt,
      });
      yield* repository.appendStreaming({
        messageId,
        threadId,
        turnId: null,
        role: "assistant",
        text: " world",
        createdAt: "2026-02-28T19:05:01.000Z",
        updatedAt: "2026-02-28T19:05:01.000Z",
      });

      const rowWithPreservedAttachments = yield* repository.getByMessageId({ messageId });
      assert.equal(rowWithPreservedAttachments._tag, "Some");
      if (rowWithPreservedAttachments._tag === "Some") {
        assert.deepEqual(rowWithPreservedAttachments.value.attachments, attachments);
      }

      yield* repository.appendStreaming({
        messageId,
        threadId,
        turnId: null,
        role: "assistant",
        text: "",
        attachments: [],
        createdAt: "2026-02-28T19:05:02.000Z",
        updatedAt: "2026-02-28T19:05:02.000Z",
      });

      const row = yield* repository.getByMessageId({ messageId });
      assert.equal(row._tag, "Some");
      if (row._tag === "Some") {
        assert.equal(row.value.text, "hello world");
        assert.deepEqual(row.value.attachments, []);
        assert.equal(row.value.createdAt, createdAt);
        assert.equal(row.value.updatedAt, "2026-02-28T19:05:02.000Z");
        assert.isTrue(row.value.isStreaming);
      }
    }),
  );

  it.effect("preserves existing attachments when upsert omits attachments", () =>
    Effect.gen(function* () {
      const repository = yield* ProjectionThreadMessageRepository;
      const threadId = ThreadId.make("thread-preserve-attachments");
      const messageId = MessageId.make("message-preserve-attachments");
      const createdAt = "2026-02-28T19:00:00.000Z";
      const updatedAt = "2026-02-28T19:00:01.000Z";
      const persistedAttachments = [
        {
          type: "image" as const,
          id: "thread-preserve-attachments-att-1",
          name: "example.png",
          mimeType: "image/png",
          sizeBytes: 5,
        },
      ];

      yield* repository.upsert({
        messageId,
        threadId,
        turnId: null,
        role: "user",
        text: "initial",
        attachments: persistedAttachments,
        isStreaming: false,
        createdAt,
        updatedAt,
      });

      yield* repository.upsert({
        messageId,
        threadId,
        turnId: null,
        role: "user",
        text: "updated",
        isStreaming: false,
        createdAt,
        updatedAt: "2026-02-28T19:00:02.000Z",
      });

      const rows = yield* repository.listByThreadId({ threadId });
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.text, "updated");
      assert.deepEqual(rows[0]?.attachments, persistedAttachments);

      const rowById = yield* repository.getByMessageId({ messageId });
      assert.equal(rowById._tag, "Some");
      if (rowById._tag === "Some") {
        assert.equal(rowById.value.text, "updated");
        assert.deepEqual(rowById.value.attachments, persistedAttachments);
      }
    }),
  );

  it.effect("allows explicit attachment clearing with an empty array", () =>
    Effect.gen(function* () {
      const repository = yield* ProjectionThreadMessageRepository;
      const threadId = ThreadId.make("thread-clear-attachments");
      const messageId = MessageId.make("message-clear-attachments");
      const createdAt = "2026-02-28T19:10:00.000Z";

      yield* repository.upsert({
        messageId,
        threadId,
        turnId: null,
        role: "assistant",
        text: "with attachment",
        attachments: [
          {
            type: "image",
            id: "thread-clear-attachments-att-1",
            name: "example.png",
            mimeType: "image/png",
            sizeBytes: 5,
          },
        ],
        isStreaming: false,
        createdAt,
        updatedAt: "2026-02-28T19:10:01.000Z",
      });

      yield* repository.upsert({
        messageId,
        threadId,
        turnId: null,
        role: "assistant",
        text: "cleared",
        attachments: [],
        isStreaming: false,
        createdAt,
        updatedAt: "2026-02-28T19:10:02.000Z",
      });

      const rows = yield* repository.listByThreadId({ threadId });
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.text, "cleared");
      assert.deepEqual(rows[0]?.attachments, []);
    }),
  );
});
