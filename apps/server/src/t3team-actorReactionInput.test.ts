import type { OrchestrationEvent } from "@t3tools/contracts";
import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  autoSummarizeActorMessage,
  buildActorReactionBatchInput,
  buildActorReactionInput,
  capActorMessageSummary,
  collectPendingActorDeliveries,
  resolveActorMessageDeliveryMaxChars,
  summarizeActorMessageForDelivery,
  T3TEAM_ACTOR_MESSAGE_DELIVERY_MAX_CHARS,
  T3TEAM_ACTOR_MESSAGE_DELIVERY_SUMMARY_MAX_CHARS,
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

describe("summarizeActorMessageForDelivery", () => {
  afterEach(() => {
    if (originalEnv === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = originalEnv;
  });

  it("delivers bodies at or under the cap verbatim", () => {
    const atCap = "a".repeat(T3TEAM_ACTOR_MESSAGE_DELIVERY_MAX_CHARS);
    const underCap = "b".repeat(T3TEAM_ACTOR_MESSAGE_DELIVERY_MAX_CHARS - 1);
    expect(summarizeActorMessageForDelivery(underCap, "m-1")).toBe(underCap);
    expect(summarizeActorMessageForDelivery(atCap, "m-1")).toBe(atCap);
  });

  it("delivers over-long bodies as a short auto-summary plus a marker with the message id", () => {
    const body = "Status: " + "w ".repeat(140) + "all green. " + "z".repeat(1500);
    const out = summarizeActorMessageForDelivery(
      body,
      "msg-42",
      undefined,
      T3TEAM_ACTOR_MESSAGE_DELIVERY_MAX_CHARS,
    );
    // Auto-summary cuts at the last sentence boundary inside the 300-char window.
    expect(out.startsWith("Status: " + "w ".repeat(140) + "all green…")).toBe(true);
    expect(out).toContain("…[summarized — " + body.length + " chars total; message id msg-42");
    expect(out).toContain("call t3team_read_message with this message id to read the full text]");
    // The raw body is NOT inlined — only the summary and the marker.
    expect(out).not.toContain("z".repeat(100));
  });

  it("prefers the sender-provided summary over the auto-summary", () => {
    const body = "head " + "z".repeat(2995); // 3000 chars
    const out = summarizeActorMessageForDelivery(
      body,
      "msg-43",
      "Branch pushed; tests green.",
      T3TEAM_ACTOR_MESSAGE_DELIVERY_MAX_CHARS,
    );
    expect(out.startsWith("Branch pushed; tests green.\n")).toBe(true);
    expect(out).toContain("message id msg-43");
    expect(out).not.toContain("zzzz");
  });

  it("caps a sender-provided summary at the summary budget on a word boundary", () => {
    const body = "head " + "z".repeat(2995);
    const longSummary = "word ".repeat(T3TEAM_ACTOR_MESSAGE_DELIVERY_SUMMARY_MAX_CHARS) + "tail";
    const out = summarizeActorMessageForDelivery(
      body,
      "msg-44",
      longSummary,
      T3TEAM_ACTOR_MESSAGE_DELIVERY_MAX_CHARS,
    );
    const head = out.split("\n")[0] ?? "";
    expect(head.length).toBeLessThanOrEqual(
      T3TEAM_ACTOR_MESSAGE_DELIVERY_SUMMARY_MAX_CHARS + 1, // ellipsis
    );
    expect(head.endsWith("…")).toBe(true);
    expect(head.endsWith(" ")).toBe(false);
  });

  it("falls back to the auto-summary when the sender summary is empty or whitespace", () => {
    const body = "Status: " + "w ".repeat(140) + "all green. " + "z".repeat(1500);
    for (const blank of ["", "   "]) {
      const out = summarizeActorMessageForDelivery(
        body,
        "msg-45",
        blank,
        T3TEAM_ACTOR_MESSAGE_DELIVERY_MAX_CHARS,
      );
      expect(out.startsWith("Status: " + "w ".repeat(140) + "all green…")).toBe(true);
    }
  });

  it("resolves the cap from the distribution-tunable env override", () => {
    process.env[ENV_KEY] = "10";
    expect(resolveActorMessageDeliveryMaxChars()).toBe(10);
    expect(summarizeActorMessageForDelivery("0123456789AB", "m-2")).toContain(
      "summarized — 12 chars total",
    );
    process.env[ENV_KEY] = "not-a-number";
    expect(resolveActorMessageDeliveryMaxChars()).toBe(T3TEAM_ACTOR_MESSAGE_DELIVERY_MAX_CHARS);
    delete process.env[ENV_KEY];
    expect(resolveActorMessageDeliveryMaxChars()).toBe(T3TEAM_ACTOR_MESSAGE_DELIVERY_MAX_CHARS);
  });

  it("embeds the summary in the reaction input", () => {
    const longEntry: T3TeamActorMailboxEntry = {
      ...entry,
      messageId: "msg-9",
      text: "w".repeat(T3TEAM_ACTOR_MESSAGE_DELIVERY_MAX_CHARS + 100),
    };
    const input = buildActorReactionInput(longEntry);
    expect(input).toContain(
      "…[summarized — " +
        (T3TEAM_ACTOR_MESSAGE_DELIVERY_MAX_CHARS + 100) +
        " chars total; message id msg-9",
    );
    expect(input).toContain(
      "long bodies are summarized on delivery and the recipient retrieves the full text with t3team_read_message",
    );
  });

  it("keeps the reaction input verbatim for short bodies", () => {
    const input = buildActorReactionInput(entry);
    expect(input).toContain("\n\nfirst\n\n");
    expect(input).not.toContain("…[summarized");
  });
});

describe("autoSummarizeActorMessage", () => {
  it("returns short text verbatim", () => {
    expect(autoSummarizeActorMessage("short body")).toBe("short body");
  });

  it("cuts at the last sentence boundary inside the window", () => {
    const text = "x ".repeat(140) + "Done. " + "y".repeat(400);
    const out = autoSummarizeActorMessage(text);
    expect(out.endsWith("…")).toBe(true);
    // Last sentence boundary in the 300-char window is after "Done."
    expect(out.startsWith("x ".repeat(140) + "Done…")).toBe(true);
  });

  it("falls back to a word boundary when no sentence boundary is near the end", () => {
    // One long "sentence" (no . ! ? within the first half of the window).
    const text = "word ".repeat(200) + "end";
    const out = autoSummarizeActorMessage(text);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toMatch(/\s…$/); // no dangling space before the ellipsis
    expect(out.length).toBeLessThanOrEqual(T3TEAM_ACTOR_MESSAGE_DELIVERY_SUMMARY_MAX_CHARS + 1);
  });

  it("falls back to the raw window for text without any boundary", () => {
    const text = "z".repeat(500);
    const out = autoSummarizeActorMessage(text);
    expect(out).toBe("z".repeat(T3TEAM_ACTOR_MESSAGE_DELIVERY_SUMMARY_MAX_CHARS) + "…");
  });
});

describe("capActorMessageSummary", () => {
  it("trims and passes short summaries through", () => {
    expect(capActorMessageSummary("  hi there ")).toBe("hi there");
  });

  it("caps long summaries at the budget on a word boundary", () => {
    const summary = "word ".repeat(T3TEAM_ACTOR_MESSAGE_DELIVERY_SUMMARY_MAX_CHARS) + "tail";
    const out = capActorMessageSummary(summary);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(T3TEAM_ACTOR_MESSAGE_DELIVERY_SUMMARY_MAX_CHARS + 1);
  });

  it("caps a summary without spaces at the raw budget", () => {
    const summary = "z".repeat(T3TEAM_ACTOR_MESSAGE_DELIVERY_SUMMARY_MAX_CHARS + 50);
    const out = capActorMessageSummary(summary);
    expect(out).toBe("z".repeat(T3TEAM_ACTOR_MESSAGE_DELIVERY_SUMMARY_MAX_CHARS) + "…");
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
    expect(input).toContain("[Message from peer agent «Sender» · thread sender · urgency normal]");
    expect(input).toContain("[Message from peer agent «Other» · thread other · urgency urgent]");
    expect(input).toContain("\n\nfirst\n\n");
    expect(input).toContain("\n\nsecond body\n\n");
    expect(input).toContain("These messages are from other agent actors, not a human user");
  });

  it("summarizes each over-long body with its own message id", () => {
    const long: T3TeamActorMailboxEntry = {
      ...entry,
      messageId: "msg-long",
      text: "x".repeat(T3TEAM_ACTOR_MESSAGE_DELIVERY_MAX_CHARS + 100),
    };
    const input = buildActorReactionBatchInput([long, second]);
    expect(input).toContain(
      "…[summarized — " +
        (T3TEAM_ACTOR_MESSAGE_DELIVERY_MAX_CHARS + 100) +
        " chars total; message id msg-long",
    );
    expect(input).toContain("second body");
  });

  it("uses each entry's own sender summary in a batch", () => {
    const long: T3TeamActorMailboxEntry = {
      ...entry,
      messageId: "msg-long",
      text: "x".repeat(T3TEAM_ACTOR_MESSAGE_DELIVERY_MAX_CHARS + 100),
      summary: "First sender's summary.",
    };
    const input = buildActorReactionBatchInput([long, second]);
    expect(input).toContain("First sender's summary.");
    expect(input).toContain("message id msg-long");
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
