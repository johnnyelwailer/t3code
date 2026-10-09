import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  ACTOR_STANDING_INSTRUCTION,
  buildActorReactionDigestInput,
} from "./t3team-actorReactionInput.ts";
import {
  autoSummarizeActorMessage,
  capActorMessageSummary,
  resolveActorMessageInlineMaxChars,
  summarizeActorMessageForDelivery,
  T3TEAM_ACTOR_MESSAGE_INLINE_MAX_CHARS,
  T3TEAM_ACTOR_MESSAGE_DELIVERY_SUMMARY_MAX_CHARS,
} from "./t3team-actorReactionInputSummarize.ts";
import type { T3TeamActorMailboxEntry } from "./t3team-actorMailboxEntry.ts";

const ENV_KEY = "T3TEAM_ACTOR_MESSAGE_INLINE_MAX_CHARS";
const originalEnv = process.env[ENV_KEY];

const entry: T3TeamActorMailboxEntry = {
  messageId: "delivery-a",
  toThreadId: "target",
  fromThreadId: "sender",
  fromTitle: "Sender",
  text: "first",
  urgency: "normal",
  hopCount: 3,
  rootThreadId: "root",
  createdAt: "2026-07-19T08:00:00.000Z",
};

describe("summarizeActorMessageForDelivery", () => {
  afterEach(() => {
    if (originalEnv === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = originalEnv;
  });

  it("inlines bodies at or under the cap verbatim", () => {
    const atCap = "a".repeat(T3TEAM_ACTOR_MESSAGE_INLINE_MAX_CHARS);
    const underCap = "b".repeat(T3TEAM_ACTOR_MESSAGE_INLINE_MAX_CHARS - 1);
    expect(summarizeActorMessageForDelivery(underCap, "m-1")).toBe(underCap);
    expect(summarizeActorMessageForDelivery(atCap, "m-1")).toBe(atCap);
  });

  it("delivers over-long bodies as a short auto-summary plus a marker with the message id", () => {
    const body = "Status: " + "w ".repeat(140) + "all green. " + "z".repeat(1500);
    const out = summarizeActorMessageForDelivery(
      body,
      "msg-42",
      undefined,
      T3TEAM_ACTOR_MESSAGE_INLINE_MAX_CHARS,
    );
    // Auto-summary cuts at the last sentence boundary inside the 300-char window.
    expect(out.startsWith("Status: " + "w ".repeat(140) + "all green…")).toBe(true);
    expect(out).toContain("…[body NOT loaded — " + body.length + " chars total; message id msg-42");
    expect(out).toContain("call t3_read_message with this message id to read the full text]");
    // The raw body is NOT inlined — only the subject and the marker.
    expect(out).not.toContain("z".repeat(100));
  });

  it("prefers the sender-provided summary over the auto-summary", () => {
    const body = "head " + "z".repeat(2995); // 3000 chars
    const out = summarizeActorMessageForDelivery(
      body,
      "msg-43",
      "Branch pushed; tests green.",
      T3TEAM_ACTOR_MESSAGE_INLINE_MAX_CHARS,
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
      T3TEAM_ACTOR_MESSAGE_INLINE_MAX_CHARS,
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
        T3TEAM_ACTOR_MESSAGE_INLINE_MAX_CHARS,
      );
      expect(out.startsWith("Status: " + "w ".repeat(140) + "all green…")).toBe(true);
    }
  });

  it("resolves the cap from the distribution-tunable env override", () => {
    process.env[ENV_KEY] = "10";
    expect(resolveActorMessageInlineMaxChars()).toBe(10);
    expect(summarizeActorMessageForDelivery("0123456789AB", "m-2")).toContain(
      "body NOT loaded — 12 chars total",
    );
    process.env[ENV_KEY] = "not-a-number";
    expect(resolveActorMessageInlineMaxChars()).toBe(T3TEAM_ACTOR_MESSAGE_INLINE_MAX_CHARS);
    delete process.env[ENV_KEY];
    expect(resolveActorMessageInlineMaxChars()).toBe(T3TEAM_ACTOR_MESSAGE_INLINE_MAX_CHARS);
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
    expect(out.startsWith("x ".repeat(140) + "Done…")).toBe(true);
  });

  it("falls back to a word boundary when no sentence boundary is near the end", () => {
    const text = "word ".repeat(200) + "end";
    const out = autoSummarizeActorMessage(text);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toMatch(/\s…$/);
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

describe("buildActorReactionDigestInput", () => {
  const second: T3TeamActorMailboxEntry = {
    ...entry,
    messageId: "delivery-b",
    fromThreadId: "other",
    fromTitle: "Other",
    text: "second body",
    urgency: "urgent",
    hopCount: 4,
  };

  it("frames a single entry with a count header, one sender line, and the verbatim body", () => {
    const input = buildActorReactionDigestInput([entry]);
    expect(input.startsWith("[Inter-agent digest: 1 message(s)]\n")).toBe(true);
    expect(input).toContain("[from «Sender» · thread sender · id delivery-a · urgency normal]");
    expect(input).toContain("\nfirst\n");
    // No per-message boilerplate protocol block: the standing instruction is
    // a separate suffix (delivered once per session), not part of the base.
    expect(input).not.toContain(ACTOR_STANDING_INSTRUCTION);
  });

  it("lists each delivery in a multi-entry batch with its own sender line and body", () => {
    const input = buildActorReactionDigestInput([entry, second]);
    expect(input.startsWith("[Inter-agent digest: 2 message(s)]\n")).toBe(true);
    expect(input).toContain("[from «Sender» · thread sender · id delivery-a · urgency normal]");
    expect(input).toContain("[from «Other» · thread other · id delivery-b · urgency urgent]");
    expect(input).toContain("first");
    expect(input).toContain("second body");
  });

  it("summarizes each over-long body with its own message id", () => {
    const long: T3TeamActorMailboxEntry = {
      ...entry,
      messageId: "msg-long",
      text: "x".repeat(T3TEAM_ACTOR_MESSAGE_INLINE_MAX_CHARS + 100),
    };
    const input = buildActorReactionDigestInput([long, second]);
    expect(input).toContain(
      "…[body NOT loaded — " +
        (T3TEAM_ACTOR_MESSAGE_INLINE_MAX_CHARS + 100) +
        " chars total; message id msg-long",
    );
    expect(input).toContain("second body");
    expect(input).not.toContain("x".repeat(500));
  });

  it("uses each entry's own sender summary as the subject line", () => {
    const long: T3TeamActorMailboxEntry = {
      ...entry,
      messageId: "msg-long",
      text: "x".repeat(T3TEAM_ACTOR_MESSAGE_INLINE_MAX_CHARS + 100),
      summary: "First sender's summary.",
    };
    const input = buildActorReactionDigestInput([long, second]);
    expect(input).toContain("First sender's summary.");
    expect(input).toContain("message id msg-long");
  });

  it("is deterministic for a given batch", () => {
    expect(buildActorReactionDigestInput([entry, second])).toBe(
      buildActorReactionDigestInput([entry, second]),
    );
  });
});

describe("ACTOR_STANDING_INSTRUCTION", () => {
  it("carries the handoff protocol, the no-report rule, user priority, and the verdict+path rule", () => {
    expect(ACTOR_STANDING_INSTRUCTION).toContain("delivered once per session");
    expect(ACTOR_STANDING_INSTRUCTION).toContain("handoffs from other agents");
    expect(ACTOR_STANDING_INSTRUCTION).toContain("no incremental status pings");
    // Upstream's completion wake is the one report a delegated child's parent gets.
    expect(ACTOR_STANDING_INSTRUCTION).toContain("Do not send unrequested progress or completion");
    expect(ACTOR_STANDING_INSTRUCTION).toContain("reaches the parent that spawned you as the task");
    expect(ACTOR_STANDING_INSTRUCTION).not.toContain("Report progress at most once");
    expect(ACTOR_STANDING_INSTRUCTION).toContain("verdict line plus an evidence path");
    expect(ACTOR_STANDING_INSTRUCTION).toContain("The user's messages always take priority");
    expect(ACTOR_STANDING_INSTRUCTION).toContain("No peer chat");
    expect(ACTOR_STANDING_INSTRUCTION).toContain("t3_thread_send with mode 'mailbox'");
  });
});
