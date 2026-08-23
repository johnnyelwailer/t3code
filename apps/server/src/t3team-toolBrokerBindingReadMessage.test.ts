/* oxlint-disable t3code/no-manual-effect-runtime-in-tests -- handler unit test bridges Effect for plain assertion-style tests; no layer under test. */
import { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { describe, expect, it } from "vite-plus/test";

import { callT3TeamReadMessageTool } from "./t3team-toolBrokerBindingReadMessage.ts";
import type { ReadMessageThreadDetail } from "./t3team-toolBrokerBindingReadMessage.ts";

const currentThreadId = ThreadId.make("thread-current");

const longBody = "x".repeat(3000);

const thread: ReadMessageThreadDetail = {
  title: "Receiver thread",
  messages: [
    { id: "user-1", role: "user", text: "start the work" },
    {
      id: "actor-msg-1",
      role: "actor",
      text: longBody,
      createdAt: "2026-07-19T08:00:00.000Z",
      t3teamExt: { actor: { senderThreadId: "thread-sender" } },
    },
    { id: "actor-msg-2", role: "actor", text: "short follow-up" },
  ],
};

const run = (
  toolArgs: unknown,
  overrides?: {
    loadThreadDetail?: (
      threadId: ThreadId,
    ) => Effect.Effect<ReadMessageThreadDetail | undefined, string>;
  },
) =>
  Effect.runPromise(
    callT3TeamReadMessageTool({
      tool: "t3team.thread.read_message",
      scopeLabel: "for this thread.",
      toolArgs,
      threadId: currentThreadId,
      loadThreadDetail:
        overrides?.loadThreadDetail ??
        ((id) => Effect.succeed(id === currentThreadId ? thread : undefined)),
    }),
  );

const structured = (result: Awaited<ReturnType<typeof run>>) =>
  result.structuredContent as Record<string, unknown>;

describe("callT3TeamReadMessageTool", () => {
  it("rejects when no handler is wired", async () => {
    const result = await Effect.runPromise(
      callT3TeamReadMessageTool({
        tool: "t3team.thread.read_message",
        scopeLabel: "for this thread.",
        toolArgs: { message_id: "actor-msg-1" },
      }),
    );
    expect(result.isError).toBe(true);
  });

  it("requires a non-empty message_id", async () => {
    const result = await run({ message_id: "   " });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("requires a non-empty 'message_id'");
  });

  it("returns the full body for a known inter-agent message id", async () => {
    const result = await run({ message_id: "actor-msg-1" });
    expect(result.isError).toBeUndefined();
    const body = structured(result);
    expect(body.ok).toBe(true);
    expect(body.messageId).toBe("actor-msg-1");
    expect(body.fromThreadId).toBe("thread-sender");
    expect(body.charCount).toBe(3000);
    expect(body.text).toBe(longBody);
  });

  it("returns the full body for a short inter-agent message too", async () => {
    const result = await run({ message_id: "actor-msg-2" });
    expect(result.isError).toBeUndefined();
    const body = structured(result);
    expect(body.text).toBe("short follow-up");
    expect(body.charCount).toBe(15);
  });

  it("errors cleanly for an unknown message id", async () => {
    const result = await run({ message_id: "nope" });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("No inter-agent message with id 'nope'");
  });

  it("does not read non-actor messages through this tool", async () => {
    const result = await run({ message_id: "user-1" });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("No inter-agent message");
  });

  it("surfaces read failures as tool errors", async () => {
    const result = await run(
      { message_id: "actor-msg-1" },
      { loadThreadDetail: () => Effect.fail("db down") },
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("db down");
  });

  it("errors when the thread is gone", async () => {
    const result = await run(
      { message_id: "actor-msg-1" },
      { loadThreadDetail: () => Effect.succeed(undefined) },
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Could not read the current thread.");
  });
});
