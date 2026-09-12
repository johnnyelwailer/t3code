import type { OrchestrationEvent } from "@t3tools/contracts";
import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  ACTOR_STANDING_INSTRUCTION,
  buildActorReactionCompressedInput,
  buildActorReactionDigestInput,
  buildActorReactionHeaderSingleInput,
  buildActorReactionInput,
  collectPendingActorDeliveries,
} from "./t3team-actorReactionInput.ts";
import {
  autoSummarizeActorMessage,
  capActorMessageSummary,
  resolveActorMessageInlineMaxChars,
  summarizeActorMessageForDelivery,
  T3TEAM_ACTOR_MESSAGE_INLINE_MAX_CHARS,
  T3TEAM_ACTOR_MESSAGE_DELIVERY_SUMMARY_MAX_CHARS,
} from "./t3team-actorReactionInputSummarize.ts";
import type { T3TeamActorMailboxEntry } from "./t3team-actorMailbox.ts";

const ENV_KEY = "T3TEAM_ACTOR_MESSAGE_INLINE_MAX_CHARS";
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
    expect(out).toContain("call t3team_read_message with this message id to read the full text]");
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

  it("is deterministic for a given batch (restart rehydrate relies on exact base text)", () => {
    expect(buildActorReactionDigestInput([entry, second])).toBe(
      buildActorReactionDigestInput([entry, second]),
    );
  });
});

describe("ACTOR_STANDING_INSTRUCTION", () => {
  it("carries the handoff protocol, the report-once rule, user priority, and the verdict+path rule", () => {
    expect(ACTOR_STANDING_INSTRUCTION).toContain("delivered once per session");
    expect(ACTOR_STANDING_INSTRUCTION).toContain("handoffs from other agents");
    expect(ACTOR_STANDING_INSTRUCTION).toContain("no incremental status pings");
    expect(ACTOR_STANDING_INSTRUCTION).toContain("verdict line plus an evidence path");
    expect(ACTOR_STANDING_INSTRUCTION).toContain("The user's messages always take priority");
    expect(ACTOR_STANDING_INSTRUCTION).toContain("No peer chat");
  });
});

// --- Restart rehydrate (B4 invariant) ----------------------------------------

const delivered = (messageId: string, text: string): OrchestrationEvent =>
  ({
    type: "thread.actor-message-delivered",
    payload: { ...entry, threadId: "target", messageId, text },
  }) as unknown as OrchestrationEvent;

const actorSent = (
  threadId: string,
  text: string,
  actor: { senderThreadId: string; hopCount: number; rootThreadId: string; messageIds?: string[] },
): OrchestrationEvent =>
  ({
    type: "thread.message-sent",
    payload: {
      threadId,
      role: "user",
      text,
      t3teamExt: {
        visibleToUser: false,
        actor: {
          senderThreadId: actor.senderThreadId,
          urgency: "normal",
          hopCount: actor.hopCount,
          rootThreadId: actor.rootThreadId,
          ...(actor.messageIds !== undefined ? { messageIds: actor.messageIds } : {}),
        },
      },
    },
  }) as unknown as OrchestrationEvent;

describe("collectPendingActorDeliveries", () => {
  it("rehydrates only actor deliveries without a durable reaction input", () => {
    const events = [
      delivered("delivery-a", "first"),
      delivered("delivery-b", "second"),
      actorSent(
        "target",
        buildActorReactionInput({ ...entry, messageId: "delivery-a", text: "first" }),
        { senderThreadId: "sender", hopCount: 3, rootThreadId: "root" },
      ),
    ];

    expect(collectPendingActorDeliveries(events, 6)).toEqual([
      expect.objectContaining({
        threadId: "target",
        entry: expect.objectContaining({ messageId: "delivery-b", text: "second" }),
      }),
    ]);
  });

  it("marks every delivery named in messageIds as reacted (format-independent)", () => {
    const events = [
      delivered("delivery-a", "first"),
      delivered("delivery-b", "second"),
      delivered("delivery-c", "third"),
      actorSent("target", "any text at all", {
        senderThreadId: "sender",
        hopCount: 3,
        rootThreadId: "root",
        messageIds: ["delivery-a", "delivery-b"],
      }),
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
      actorSent("other-thread", "any text", {
        senderThreadId: "sender",
        hopCount: 3,
        rootThreadId: "root",
        messageIds: ["delivery-a"],
      }),
    ];

    expect(collectPendingActorDeliveries(events, 6)).toHaveLength(1);
  });

  // B4 invariant: a restart must NOT re-queue (double-react) a delivery whose
  // reaction was already admitted under ANY framing the logs may carry.

  it("marks a delivery reacted when the admitted input used the NEW DIGEST base", () => {
    const reactedEntry = { ...entry, messageId: "delivery-a", text: "first" };
    const events = [
      delivered("delivery-a", "first"),
      delivered("delivery-b", "second"),
      actorSent(
        "target",
        // The digest base WITH the once-per-session standing suffix:
        buildActorReactionDigestInput([reactedEntry]) + "\n\n" + ACTOR_STANDING_INSTRUCTION,
        { senderThreadId: "sender", hopCount: 3, rootThreadId: "root" },
      ),
    ];

    expect(collectPendingActorDeliveries(events, 6)).toEqual([
      expect.objectContaining({
        threadId: "target",
        entry: expect.objectContaining({ messageId: "delivery-b", text: "second" }),
      }),
    ]);
  });

  it("marks a delivery reacted when the admitted input used the LEGACY full-body base", () => {
    const reactedEntry = { ...entry, messageId: "delivery-a", text: "first" };
    const events = [
      delivered("delivery-a", "first"),
      delivered("delivery-b", "second"),
      actorSent(
        "target",
        buildActorReactionInput(reactedEntry) + "\n[user-return suffix]",
        { senderThreadId: "sender", hopCount: 3, rootThreadId: "root" },
      ),
    ];

    expect(collectPendingActorDeliveries(events, 6)).toHaveLength(1);
    expect(collectPendingActorDeliveries(events, 6)[0]?.entry.messageId).toBe("delivery-b");
  });

  it("marks a delivery reacted when the admitted input used the LEGACY header-only base", () => {
    const reactedEntry = { ...entry, messageId: "delivery-a", text: "first" };
    const events = [
      delivered("delivery-a", "first"),
      delivered("delivery-b", "second"),
      actorSent(
        "target",
        buildActorReactionHeaderSingleInput(reactedEntry) + "\n[user-return suffix]",
        { senderThreadId: "sender", hopCount: 3, rootThreadId: "root" },
      ),
    ];

    expect(collectPendingActorDeliveries(events, 6)).toHaveLength(1);
    expect(collectPendingActorDeliveries(events, 6)[0]?.entry.messageId).toBe("delivery-b");
  });

  it("marks a delivery reacted when the admitted input used the LEGACY compressed base", () => {
    const reactedEntry = { ...entry, messageId: "delivery-a", text: "first" };
    const events = [
      delivered("delivery-a", "first"),
      delivered("delivery-b", "second"),
      actorSent(
        "target",
        buildActorReactionCompressedInput([reactedEntry]) + "\n[user-return suffix]",
        { senderThreadId: "sender", hopCount: 3, rootThreadId: "root" },
      ),
    ];

    expect(collectPendingActorDeliveries(events, 6)).toHaveLength(1);
    expect(collectPendingActorDeliveries(events, 6)[0]?.entry.messageId).toBe("delivery-b");
  });

  it("keeps a delivery pending when no admitted input matches its framing", () => {
    const events = [
      delivered("delivery-a", "first"),
      delivered("delivery-b", "second"),
      actorSent("target", "unrelated admitted input", {
        senderThreadId: "sender",
        hopCount: 3,
        rootThreadId: "root",
      }),
    ];

    expect(collectPendingActorDeliveries(events, 6)).toHaveLength(2);
  });

  // UPGRADE CASE: a delivery held in OLD-format before the digest-framing
  // overhaul must not be re-delivered after the restart. The old full-body
  // framing inlined bodies up to 1500 chars and marked over-long ones with
  // `…[summarized —`; re-deriving those admitted inputs with the new 1000-char
  // cap / `…[body NOT loaded —` marker would fail to prefix-match and the
  // thread would react to the same work twice.

  it("does not re-deliver a held delivery admitted under the LEGACY framing (body between the new and old caps)", () => {
    const body = "x".repeat(1200); // over the new 1000 cap, under the old 1500 cap
    const reactedEntry = { ...entry, messageId: "delivery-a", text: body };
    const legacyAdmitted = buildActorReactionInput(reactedEntry);
    // The admitted input must be the OLD framing: body inlined verbatim (the
    // legacy cap was 1500), and the NEW digest base for the same entry is a
    // pointer — proof that only the legacy base can match this text.
    expect(legacyAdmitted).toContain(body);
    expect(buildActorReactionDigestInput([reactedEntry])).not.toContain(body);
    expect(legacyAdmitted).not.toContain("…[body NOT loaded —");

    const events = [
      delivered("delivery-a", body),
      delivered("delivery-b", "second"),
      actorSent(
        "target",
        legacyAdmitted + "\n[user-return suffix]",
        { senderThreadId: "sender", hopCount: 3, rootThreadId: "root" },
      ),
    ];

    const pending = collectPendingActorDeliveries(events, 6);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.entry.messageId).toBe("delivery-b");
  });

  it("does not re-deliver a held long-body delivery admitted under the LEGACY marker (body over both caps)", () => {
    const body = "lorem ipsum. ".repeat(200); // 2000 chars, over both caps
    const reactedEntry = { ...entry, messageId: "delivery-a", text: body };
    const legacyAdmitted = buildActorReactionInput(reactedEntry);
    // The OLD marker wording — the new base for this entry uses the new one.
    expect(legacyAdmitted).toContain("…[summarized —");
    expect(legacyAdmitted).not.toContain("…[body NOT loaded —");
    expect(buildActorReactionDigestInput([reactedEntry])).toContain("…[body NOT loaded —");

    const events = [
      delivered("delivery-a", body),
      delivered("delivery-b", "second"),
      actorSent(
        "target",
        legacyAdmitted + "\n[user-return suffix]",
        { senderThreadId: "sender", hopCount: 3, rootThreadId: "root" },
      ),
    ];

    const pending = collectPendingActorDeliveries(events, 6);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.entry.messageId).toBe("delivery-b");
  });
});
