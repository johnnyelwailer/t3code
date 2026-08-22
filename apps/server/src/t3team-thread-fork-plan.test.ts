import { describe, expect, it } from "vite-plus/test";

import {
  estimateMessageTokens,
  FORK_TRANSCRIPT_TOKEN_CAP,
  planForkTranscript,
} from "./t3team-thread-fork-plan.ts";

const ids = (count: number, prefix = "m") =>
  Array.from({ length: count }, (_, i) => `${prefix}${i + 1}`);

const tokensOf = (messageIds: readonly string[], tokensEach: number) =>
  new Map(messageIds.map((id) => [id, tokensEach]));

describe("estimateMessageTokens", () => {
  it("estimates text at chars/4 and adds a flat allowance per attachment", () => {
    expect(estimateMessageTokens({ text: "abcd" })).toBe(1);
    expect(estimateMessageTokens({ text: "abcde" })).toBe(2);
    expect(estimateMessageTokens({ text: "" })).toBe(0);
    expect(estimateMessageTokens({ text: "abcd", attachments: [1, 2] })).toBe(1 + 2 * 512);
    expect(estimateMessageTokens({})).toBe(0);
  });
});

describe("planForkTranscript", () => {
  it("keeps everything when the transcript fits the cap", () => {
    const messageIds = ids(10);
    const plan = planForkTranscript(messageIds, tokensOf(messageIds, 100));
    expect(plan.truncated).toBe(false);
    expect(plan.omittedCount).toBe(0);
    expect([...plan.head, ...plan.tail]).toEqual(messageIds);
  });

  it("keeps a single message even when it alone exceeds the cap", () => {
    const plan = planForkTranscript(["only"], new Map([["only", 1_000_000]]));
    expect(plan.truncated).toBe(false);
    expect([...plan.head, ...plan.tail]).toEqual(["only"]);
  });

  it("middle-truncates an oversized transcript, keeping the head and the tail", () => {
    // 100 messages x 1000 tokens = 100k tokens against a 30k cap.
    const messageIds = ids(100);
    const plan = planForkTranscript(messageIds, tokensOf(messageIds, 1000));
    expect(plan.truncated).toBe(true);
    expect(plan.omittedCount).toBeGreaterThan(0);

    const kept = [...plan.head, ...plan.tail];
    // Head comes first, tail after, in original order, with a gap between.
    const headIndex = kept.indexOf("m1");
    const tailIndex = kept.indexOf("m100");
    expect(headIndex).toBe(0);
    expect(tailIndex).toBe(kept.length - 1);
    expect(Number(plan.head[plan.head.length - 1]!.slice(1))).toBeLessThan(
      Number(plan.tail[0]!.slice(1)),
    );
    // Nothing kept twice, nothing out of order.
    expect(new Set(kept).size).toBe(kept.length);
    for (let i = 1; i < kept.length; i++) {
      expect(Number(kept[i]!.slice(1))).toBeGreaterThan(Number(kept[i - 1]!.slice(1)));
    }
    // The tail (recent context) gets the larger share of the budget.
    expect(plan.tail.length).toBeGreaterThanOrEqual(plan.head.length);
    // The kept total stays near the cap (one oversized boundary message allowed).
    const keptTokens = kept.length * 1000;
    expect(keptTokens).toBeLessThanOrEqual(FORK_TRANSCRIPT_TOKEN_CAP + 1000 * 2);
  });

  it("always keeps the most recent message even when it alone exceeds the tail budget", () => {
    const messageIds = ids(50);
    const tokens = tokensOf(messageIds, 1000);
    tokens.set("m50", 100_000); // one huge final message
    const plan = planForkTranscript(messageIds, tokens);
    expect(plan.tail).toContain("m50");
    expect(plan.truncated).toBe(true);
  });

  it("respects a custom cap", () => {
    const messageIds = ids(20);
    const plan = planForkTranscript(messageIds, tokensOf(messageIds, 1000), 5000);
    expect(plan.truncated).toBe(true);
    expect(plan.head.length + plan.tail.length).toBeLessThan(20);
  });
});
