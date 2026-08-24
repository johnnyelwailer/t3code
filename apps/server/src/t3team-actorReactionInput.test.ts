import type { OrchestrationEvent } from "@t3tools/contracts";
import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  buildActorReactionBatchInput,
  buildActorReactionInput,
  collectPendingActorDeliveries,
  resolveActorMessageDeliveryMaxChars,
  T3TEAM_ACTOR_MESSAGE_DELIVERY_MAX_CHARS,
  truncateActorMessageForDelivery,
} from "./t3team-actorReactionInput.ts";
import type { T3TeamActorMailboxEntry } from "./t3team-actorMailbox.ts";

const ENV_KEY = "T3TEAM_ACTOR_MESSAGE_DELIVERY_MAX_CHARS";
const originalEnv = process.env[ENV_KEY];

const entry: T3TeamActorMailboxEntry = {
  messageId: "delivery-a",
  fromThreadId: "sender",
  fromTitle: "Sender",
  fromProjectId: "project",
  text: "first",
  urgency: "normal",
  hopCount: 3,
  rootThreadId: "root",
  createdAt: "2026-07-19T08:00:00.000Z",
  dispatchAttempts: 0,
};

describe("truncateActorMessageForDelivery", () => {
  afterEach(() => {
    if (originalEnv === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = originalEnv;
  });

  it("delivers bodies at or under the cap verbatim", () => {
    const atCap = "a".repeat(T3TEAM_ACTOR_MESSAGE_DELIVERY_MAX_CHARS);
    const underCap = "b".repeat(T3TEAM_ACTOR_MESSAGE_DELIVERY_MAX_CHARS - 1);
    expect(truncateActorMessageForDelivery(underCap, "m-1")).toBe(underCap);
    expect(truncateActorMessageForDelivery(atCap, "m-1")).toBe(atCap);
  });

  it("delivers over-long bodies as a 500-char preview plus a marker with the message id", () => {
    const body = "head " + "z".repeat(2995); // 3000 chars
    const out = truncateActorMessageForDelivery(
      body,
      "msg-42",
      T3TEAM_ACTOR_MESSAGE_DELIVERY_MAX_CHARS,
    );
    expect(out.startsWith(body.slice(0, 500))).toBe(true);
    expect(out).toContain("…[truncated — 3000 chars total; message id msg-42");
    expect(out).toContain("call t3team_read_message with this message id to read the full text]");
    expect(out.length).toBeLessThan(body.length);
  });

  it("resolves the cap from the distribution-tunable env override", () => {
    process.env[ENV_KEY] = "10";
    expect(resolveActorMessageDeliveryMaxChars()).toBe(10);
    expect(truncateActorMessageForDelivery("0123456789AB", "m-2")).toContain(
      "truncated — 12 chars total",
    );
    process.env[ENV_KEY] = "not-a-number";
    expect(resolveActorMessageDeliveryMaxChars()).toBe(T3TEAM_ACTOR_MESSAGE_DELIVERY_MAX_CHARS);
    delete process.env[ENV_KEY];
    expect(resolveActorMessageDeliveryMaxChars()).toBe(T3TEAM_ACTOR_MESSAGE_DELIVERY_MAX_CHARS);
  });

  it("embeds the truncated preview in the reaction input", () => {
    const longEntry: T3TeamActorMailboxEntry = {
      ...entry,
      messageId: "msg-9",
      text: "w".repeat(T3TEAM_ACTOR_MESSAGE_DELIVERY_MAX_CHARS + 100),
    };
    const input = buildActorReactionInput(longEntry);
    expect(input).toContain("…[truncated — 1600 chars total; message id msg-9");
    expect(input).toContain(
      "long bodies are truncated on delivery and the recipient retrieves the full text with t3team_read_message",
    );
  });

  it("keeps the reaction input verbatim for short bodies", () => {
    const input = buildActorReactionInput(entry);
    expect(input).toContain("\n\nfirst\n\n");
    expect(input).not.toContain("…[truncated");
  });
});

describe("buildActorReactionBatchInput", () => {
  const second: T3TeamActorMailboxEntry = {
    ...entry,
    messageId: "delivery-b",
    fromThreadId: "other",
    fromTitle: "Other",
    text: "second body",
    urgency: "urgent",
    hopCount: 4,
  };

  it("formats a single-entry batch EXACTLY like the single-message input", () => {
    expect(buildActorReactionBatchInput([entry])).toBe(buildActorReactionInput(entry));
  });

  it("lists each delivery with its own sender framing in a batch header", () => {
    const input = buildActorReactionBatchInput([entry, second]);
    expect(input.startsWith("[2 messages from peer agents]\n")).toBe(true);
    expect(input).toContain(
      "[Message from peer agent «Sender» · thread sender · urgency normal]",
    );
    expect(input).toContain(
      "[Message from peer agent «Other» · thread other · urgency urgent]",
    );
    expect(input).toContain("\n\nfirst\n\n");
    expect(input).toContain("\n\nsecond body\n\n");
    expect(input).toContain("These messages are from other agent actors, not a human user");
  });

  it("truncates each over-long body with its own message id", () => {
    const long: T3TeamActorMailboxEntry = {
      ...entry,
      messageId: "msg-long",
      text: "x".repeat(T3TEAM_ACTOR_MESSAGE_DELIVERY_MAX_CHARS + 100),
    };
    const input = buildActorReactionBatchInput([long, second]);
    expect(input).toContain("…[truncated — 1600 chars total; message id msg-long");
    expect(input).toContain("second body");
  });
});

const delivered = (messageId: string, text: string): OrchestrationEvent =>
  ({
    type: "thread.actor-message-delivered",
    payload: { ...entry, threadId: "target", messageId, text },
  }) as unknown as OrchestrationEvent;

describe("collectPendingActorDeliveries", () => {
  it("rehydrates only actor deliveries without a durable reaction input", () => {
    const reactedEntry = { ...entry, messageId: "delivery-a", text: "first" };
    const events = [
      delivered("delivery-a", "first"),
      delivered("delivery-b", "second"),
      {
        type: "thread.message-sent",
        payload: {
          threadId: "target",
          role: "user",
          text: buildActorReactionInput(reactedEntry),
          t3teamExt: {
            visibleToUser: false,
            actor: {
              senderThreadId: "sender",
              urgency: "normal",
              hopCount: 3,
              rootThreadId: "root",
            },
          },
        },
      } as unknown as OrchestrationEvent,
    ];

    expect(collectPendingActorDeliveries(events, 6)).toEqual([
      expect.objectContaining({
        threadId: "target",
        entry: expect.objectContaining({ messageId: "delivery-b", text: "second" }),
      }),
    ]);
  });

  it("marks every delivery named in a batched reaction input as reacted", () => {
    const events = [
      delivered("delivery-a", "first"),
      delivered("delivery-b", "second"),
      delivered("delivery-c", "third"),
      {
        type: "thread.message-sent",
        payload: {
          threadId: "target",
          role: "user",
          text: "batched reaction input",
          t3teamExt: {
            visibleToUser: false,
            actor: {
              senderThreadId: "sender",
              urgency: "normal",
              hopCount: 3,
              rootThreadId: "root",
              messageIds: ["delivery-a", "delivery-b"],
            },
          },
        },
      } as unknown as OrchestrationEvent,
    ];

    expect(collectPendingActorDeliveries(events, 6)).toEqual([
      expect.objectContaining({
        threadId: "target",
        entry: expect.objectContaining({ messageId: "delivery-c", text: "third" }),
      }),
    ]);
  });

  it("ignores a batched reaction input for another thread", () => {
    const events = [
      delivered("delivery-a", "first"),
      {
        type: "thread.message-sent",
        payload: {
          threadId: "other-thread",
          role: "user",
          text: "batched reaction input",
          t3teamExt: {
            visibleToUser: false,
            actor: {
              senderThreadId: "sender",
              urgency: "normal",
              hopCount: 3,
              rootThreadId: "root",
              messageIds: ["delivery-a"],
            },
          },
        },
      } as unknown as OrchestrationEvent,
    ];

    expect(collectPendingActorDeliveries(events, 6)).toHaveLength(1);
  });
});
