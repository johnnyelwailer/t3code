/* oxlint-disable t3code/no-manual-effect-runtime-in-tests -- handler unit test bridges Effect for plain assertion-style tests; no layer under test. */
import { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { describe, expect, it } from "vite-plus/test";

import {
  callT3TeamReadMessageTool,
  type ReadMessageMailboxEntry,
} from "./t3team-toolBrokerBindingReadMessage.ts";

const currentThreadId = ThreadId.make("thread-current");
const longBody = "x".repeat(3000);
const mailbox = new Map<string, ReadMessageMailboxEntry>([
  [
    "thread-current/msg-1",
    { fromThreadId: "thread-sender", text: longBody, createdAt: "2026-07-19T08:00:00.000Z" },
  ],
  [
    "thread-other/msg-2",
    { fromThreadId: "thread-sender", text: "not yours", createdAt: "2026-07-19T08:00:00.000Z" },
  ],
]);

const run = (toolArgs: unknown, withReader = true) =>
  Effect.runPromise(
    callT3TeamReadMessageTool({
      tool: "t3team.thread.read_message",
      scopeLabel: "for this thread.",
      toolArgs,
      threadId: currentThreadId,
      ...(withReader
        ? {
            readMailboxMessage: (threadId: ThreadId, messageId: string) =>
              messageId === "boom"
                ? Effect.fail("database is locked")
                : Effect.succeed(mailbox.get(`${threadId}/${messageId}`) ?? null),
          }
        : {}),
    }),
  );

describe("t3team.thread.read_message", () => {
  it("returns the full persisted body of a message delivered to this thread", async () => {
    const result = await run({ message_id: " msg-1 " });
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({
      ok: true,
      messageId: "msg-1",
      fromThreadId: "thread-sender",
      createdAt: "2026-07-19T08:00:00.000Z",
      charCount: 3000,
      text: longBody,
    });
  });

  it("does not read another thread's mailbox", async () => {
    const result = await run({ message_id: "msg-2" });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("No inter-agent message with id 'msg-2'");
  });

  it("validates the id and reports reader failures and a missing reader", async () => {
    expect((await run({})).content[0]?.text).toContain("requires a non-empty 'message_id'");
    expect((await run({ message_id: "boom" })).content[0]?.text).toContain("database is locked");
    expect((await run({ message_id: "msg-1" }, false)).content[0]?.text).toContain(
      "is not enabled for this thread.",
    );
  });
});
