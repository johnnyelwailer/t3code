import { describe, expect, it } from "vite-plus/test";

import {
  ACTOR_BURST_ITEM_SUBJECT_MAX_CHARS,
  ACTOR_BURST_FOLD_THRESHOLD,
  automatedBurstItemLine,
  renderAutomatedBurstBlock,
  splitAutomatedBurst,
} from "./t3team-actorBurstFold.ts";
import { buildActorReactionDigestInput } from "./t3team-actorReactionInput.ts";
import { buildActorRestartHoldSummary } from "./t3team-actorRestartHold.ts";
import type { T3TeamActorMailboxEntry } from "./t3team-actorMailbox.ts";

/** Build a minimal actor mailbox entry; `summary`/`urgency` are overridable. */
const makeEntry = (
  messageId: string,
  over: { fromTitle?: string; fromThreadId?: string; text?: string; summary?: string; urgency?: "normal" | "urgent" } = {},
): T3TeamActorMailboxEntry => ({
  messageId,
  fromThreadId: over.fromThreadId ?? "watcher",
  fromTitle: over.fromTitle ?? "Silence Watch",
  fromProjectId: "project",
  text: over.text ?? `Target «${messageId}» stopped abnormally.`,
  ...(over.summary !== undefined ? { summary: over.summary } : {}),
  urgency: over.urgency ?? "normal",
  hopCount: 1,
  rootThreadId: "root",
  createdAt: "2026-09-12T18:00:00.000Z",
  dispatchAttempts: 0,
});

/** N distinct non-urgent entries — the deduplicated set the ledger hands down. */
const burst = (n: number): T3TeamActorMailboxEntry[] =>
  Array.from({ length: n }, (_, i) => makeEntry(`msg-${i + 1}`));

describe("splitAutomatedBurst", () => {
  it("splits urgent entries out and flags a burst only past the threshold", () => {
    const { urgent, foldable, isBurst } = splitAutomatedBurst([
      makeEntry("u", { urgency: "urgent" }),
      ...burst(5),
    ]);
    expect(urgent.map((e) => e.messageId)).toEqual(["u"]);
    expect(foldable).toHaveLength(5);
    expect(isBurst).toBe(true);
  });

  it("is not a burst at or below the threshold", () => {
    expect(splitAutomatedBurst(burst(ACTOR_BURST_FOLD_THRESHOLD)).isBurst).toBe(false);
    expect(splitAutomatedBurst(burst(ACTOR_BURST_FOLD_THRESHOLD + 1)).isBurst).toBe(true);
  });
});

describe("automatedBurstItemLine", () => {
  it("carries the message id, sender, thread, urgency and a short subject", () => {
    const line = automatedBurstItemLine(
      makeEntry("abc123", { fromTitle: "Silence Watch", fromThreadId: "fbdb583b", text: "gone" }),
    );
    expect(line.startsWith("- id abc123 · «Silence Watch» · thread fbdb583b · normal — ")).toBe(true);
  });

  it("caps the subject to the burst-item budget (super compact, not a full body)", () => {
    const long = "word ".repeat(500) + "tail";
    const line = automatedBurstItemLine(makeEntry("m", { text: long }));
    expect(line).not.toContain("word ".repeat(100));
    // The subject is cut at a boundary and ellipsized; the whole line stays short.
    expect(line.endsWith("…")).toBe(true);
    const subject = line.slice(line.indexOf("— ") + 2);
    expect(subject.length).toBeLessThanOrEqual(ACTOR_BURST_ITEM_SUBJECT_MAX_CHARS + 1);
  });

  it("prefers the sender summary when present", () => {
    const line = automatedBurstItemLine(makeEntry("m", { text: "body", summary: "short stop" }));
    expect(line).toContain("— short stop");
  });
});

describe("renderAutomatedBurstBlock", () => {
  it("returns empty for a sub-threshold batch (caller keeps the full form)", () => {
    expect(renderAutomatedBurstBlock(burst(ACTOR_BURST_FOLD_THRESHOLD))).toBe("");
  });

  it("renders one compact list: count header, one line per item, and the read pointer", () => {
    const block = renderAutomatedBurstBlock(burst(7));
    expect(block).toContain("[Inter-agent burst: 7 messages folded");
    expect(block).toContain("read any in full with t3team_read_message");
    const itemLines = block.split("\n").filter((l) => l.startsWith("- id "));
    expect(itemLines).toHaveLength(7);
    // Every item's id is retrievable on demand via t3team_read_message.
    for (let i = 1; i <= 7; i += 1) expect(block).toContain(`id msg-${i} `);
  });
});

describe("buildActorReactionDigestInput · burst fold", () => {
  it("folds a burst of >threshold non-urgent entries into ONE compact list", () => {
    const input = buildActorReactionDigestInput(burst(10));
    expect(input.startsWith("[Inter-agent digest: 10 message(s)]\n")).toBe(true);
    expect(input).toContain("[Inter-agent burst: 10 messages folded");
    // One compact list, NOT ten verbose full blocks.
    expect(input).not.toContain("[from «Silence Watch»");
    const itemLines = input.split("\n").filter((l) => l.startsWith("- id "));
    expect(itemLines).toHaveLength(10);
  });

  it("keeps the full per-entry form at or below the threshold", () => {
    const input = buildActorReactionDigestInput(burst(ACTOR_BURST_FOLD_THRESHOLD));
    expect(input).not.toContain("[Inter-agent burst:");
    for (let i = 1; i <= ACTOR_BURST_FOLD_THRESHOLD; i += 1) {
      expect(input).toContain(`[from «Silence Watch» · thread watcher · id msg-${i}`);
    }
  });

  it("keeps the single-entry base byte-shape (B4 restart rehydrate relies on it)", () => {
    const single = buildActorReactionDigestInput([makeEntry("only")]);
    expect(single).not.toContain("[Inter-agent burst:");
    expect(single).toContain("[from «Silence Watch» · thread watcher · id only · urgency normal]");
    expect(single).toContain("Target «only» stopped abnormally.");
  });

  it("bypasses the fold for urgent entries (they keep their own full block)", () => {
    const input = buildActorReactionDigestInput([
      makeEntry("urgent-1", { fromTitle: "Abnormal Stop", urgency: "urgent" }),
      ...burst(6),
    ]);
    // The urgent entry is a full block with its verbatim body, NOT a fold line.
    expect(input).toContain("[from «Abnormal Stop» · thread watcher · id urgent-1 · urgency urgent]");
    expect(input).toContain("[Inter-agent burst: 6 messages folded");
    const itemLines = input.split("\n").filter((l) => l.startsWith("- id "));
    expect(itemLines).toHaveLength(6);
    expect(itemLines.some((l) => l.includes("id urgent-1"))).toBe(false);
  });

  it("renders the deduplicated set as-is (one line per distinct item, no re-collapse)", () => {
    // The ledger already collapsed 32 repeated terminals to 12 distinct; the
    // fold just renders those 12 compactly — 12 lines, not fewer, not more.
    const input = buildActorReactionDigestInput(burst(12));
    expect(input).toContain("[Inter-agent burst: 12 messages folded");
    expect(input.split("\n").filter((l) => l.startsWith("- id "))).toHaveLength(12);
  });
});

describe("buildActorRestartHoldSummary · burst fold", () => {
  it("folds a held burst of non-urgent messages into ONE compact list", () => {
    const out = buildActorRestartHoldSummary({ entries: burst(9), interruptedChildren: [] });
    expect(out).toContain("[Inter-agent burst: 9 messages folded");
    const itemLines = out.split("\n").filter((l) => l.startsWith("- id "));
    expect(itemLines).toHaveLength(9);
    // The held-messages inlined-body form is replaced, not duplicated.
    expect(out).toContain("9 inter-agent message(s) were pending");
  });

  it("keeps the full per-line form for a sub-threshold held batch", () => {
    const out = buildActorRestartHoldSummary({
      entries: burst(ACTOR_BURST_FOLD_THRESHOLD),
      interruptedChildren: [],
    });
    expect(out).not.toContain("[Inter-agent burst:");
    expect(out).toContain("[msg-1] from «Silence Watch» (thread watcher):");
  });
});

/**
 * Real-row measurement (thread fbdb583b shape): 12 DISTINCT "stopped"
 * silence-watch notices after the #222 ledger dedup (32 raw -> 12). Each body
 * is the real buildSilenceMessageText("stopped") shape, and each carries the
 * sender summary the emit sets. Asserts the fold strictly shrinks the
 * delivered framing and still names every item for on-demand retrieval.
 */
const realShape = (i: number): T3TeamActorMailboxEntry => {
  const title = `Fix ${"ABCDEFGHIJKL"[i] ?? i}`;
  const text =
    `[Thread stopped] «${title}» (thread fbdb-${i + 1}) reached a terminal state ` +
    `(error) while you were watching it for silence (watch w${i + 1}). The watch is closed.`;
  return {
    messageId: `r-${i + 1}`,
    fromThreadId: `fbdb-${i + 1}`,
    fromTitle: title,
    fromProjectId: "project",
    text,
    summary: `Watched thread stopped: ${title}`,
    urgency: "normal",
    hopCount: 0,
    rootThreadId: "root",
    createdAt: "2026-09-12T18:00:00.000Z",
    dispatchAttempts: 0,
  };
};
const bytes = (s: string) => new TextEncoder().encode(s).length;

// The PRE-fold digest framing, byte-for-byte (the old flatMap shape), so the
// savings are measured against exactly what was delivered before the fold.
const preFoldDigest = (entries: T3TeamActorMailboxEntry[]): string =>
  [
    `[Inter-agent digest: ${entries.length} message(s)]`,
    "",
    ...entries.flatMap((e) => [
      `[from «${e.fromTitle}» · thread ${e.fromThreadId} · id ${e.messageId} · urgency ${e.urgency}]`,
      "",
      e.text,
      "",
    ]),
  ].join("\n");

describe("buildActorReactionDigestInput · real-row savings (fbdb583b shape)", () => {
  it("folds 12 deduplicated notices into one compact list that names every item", () => {
    const entries = Array.from({ length: 12 }, (_, i) => realShape(i));
    const before = preFoldDigest(entries);
    const after = buildActorReactionDigestInput(entries);
    // Strictly smaller, and every id is still retrievable on demand.
    expect(bytes(after)).toBeLessThan(bytes(before));
    expect(after).toContain("[Inter-agent burst: 12 messages folded");
    expect(after).toContain("read any in full with t3team_read_message");
    for (let i = 1; i <= 12; i += 1) expect(after).toContain(`id r-${i} `);
    // The compact form does NOT inline the full bodies (one line each, capped).
    expect(after).not.toContain("reached a terminal state");
  });
});
