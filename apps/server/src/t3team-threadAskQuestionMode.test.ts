/* oxlint-disable t3code/no-manual-effect-runtime-in-tests -- handler unit test bridges Effect for plain assertion-style tests; no layer under test. */
import { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { describe, expect, it } from "vite-plus/test";

import {
  buildThreadAskMessages,
  T3TEAM_ASK_SYSTEM_PROMPT,
  type ThreadAskFn,
  type ThreadAskRequest,
} from "./t3team-threadAskModel.ts";
import {
  estimateAskTokens,
  renderAskEntry,
  T3TEAM_ASK_MAX_ENTRY_CHARS,
} from "./t3team-threadAskSpan.ts";
import {
  callT3TeamSearchThreadTool,
  type SearchThreadDetail,
} from "./t3team-toolBrokerBindingSearchThread.ts";

const threadId = ThreadId.make("thread-current");

const thread: SearchThreadDetail = {
  title: "Current thread",
  messages: [
    { id: "m1", role: "user", text: "start the deploy" },
    { id: "m2", role: "assistant", text: "queued" },
    { id: "m3", role: "user", text: "status?" },
    { id: "m4", role: "assistant", text: "the deploy failed: NEEDLE in the migration step" },
    { id: "m5", role: "user", text: "why" },
    { id: "m6", role: "assistant", text: "a duplicate index" },
    { id: "m7", role: "user", text: "ok" },
  ],
};

type Recorded = ThreadAskRequest | undefined;

const run = (
  toolArgs: unknown,
  overrides?: {
    ask?: ThreadAskFn;
    loadThreadDetail?: (id: ThreadId) => Effect.Effect<SearchThreadDetail | undefined, string>;
  },
) =>
  Effect.runPromise(
    callT3TeamSearchThreadTool({
      tool: "t3team.thread.search",
      scopeLabel: "for this thread.",
      toolArgs,
      threadId,
      loadThreadDetail: overrides?.loadThreadDetail ?? (() => Effect.succeed(thread)),
      ...(overrides?.ask ? { ask: overrides.ask } : {}),
    }),
  );

const structured = (result: Awaited<ReturnType<typeof run>>) =>
  result.structuredContent as Record<string, unknown>;

const recordingAsk = (answer: string) => {
  const seen: { request: Recorded } = { request: undefined };
  const ask: ThreadAskFn = async (request) => {
    seen.request = request;
    return answer;
  };
  return { ask, seen };
};

describe("t3team.thread.search question mode", () => {
  it("is off by default — a plain query result carries no answer fields", async () => {
    const body = structured(await run({ query: "NEEDLE" }));
    expect(body.totalMatches).toBe(1);
    expect(body.answer).toBeUndefined();
    expect(body.citations).toBeUndefined();
    expect(body.spanUsed).toBeUndefined();
    expect(body.promptTokensEstimate).toBeUndefined();
    expect(body.answerError).toBeUndefined();
  });

  it("answers from the matched entries and their neighbourhood, with citations", async () => {
    const { ask, seen } = recordingAsk("The migration step failed [[cite:4]].");
    const body = structured(await run({ query: "NEEDLE", question: "why did it fail?" }, { ask }));

    expect(body.totalMatches).toBe(1);
    expect(body.answer).toBe("The migration step failed [[cite:4]].");
    expect(body.citations).toEqual([{ position: 4, source: "message", id: "m4" }]);
    // Two entries either side of the single match at position 4.
    expect(body.spanUsed).toEqual({ fromPosition: 2, toPosition: 6, entryCount: 5 });
    expect(body.truncated).toBeUndefined();
    expect(typeof body.promptTokensEstimate).toBe("number");

    const transcript = seen.request?.transcript ?? "";
    expect(transcript).toContain("[position 2 | message | assistant]");
    expect(transcript).toContain("NEEDLE in the migration step");
    expect(transcript).not.toContain("start the deploy");
    expect(transcript).not.toContain("[position 7");
  });

  it("answers from an explicit fromPosition/toPosition span without a query", async () => {
    const { ask, seen } = recordingAsk("Yes.");
    const body = structured(
      await run({ question: "what happened?", fromPosition: 5, toPosition: 6 }, { ask }),
    );

    expect(body.spanUsed).toEqual({ fromPosition: 5, toPosition: 6, entryCount: 2 });
    expect(body.totalMatches).toBe(0);
    expect(body.answer).toBe("Yes.");
    expect(seen.request?.transcript).toContain("a duplicate index");
    expect(seen.request?.transcript).not.toContain("the deploy failed");
    // No query was given, so no "nothing matched" hint should be invented.
    expect(body.hint).toBeUndefined();
  });

  it("narrows an over-budget span to the newest end and reports truncated", async () => {
    const bulky: SearchThreadDetail = {
      messages: Array.from({ length: 30 }, (_value, index) => ({
        id: `b${index + 1}`,
        role: "assistant",
        // ~2k tokens per entry, so the 8k default budget fits only a few.
        text: `entry ${index + 1} ${"x".repeat(8_000)}`,
      })),
    };
    const { ask, seen } = recordingAsk("ok");
    const body = structured(
      await run(
        { question: "what is the latest?" },
        { ask, loadThreadDetail: () => Effect.succeed(bulky) },
      ),
    );

    const span = body.spanUsed as { fromPosition: number; toPosition: number; entryCount: number };
    expect(body.truncated).toBe(true);
    expect(span.toPosition).toBe(30);
    expect(span.entryCount).toBeLessThan(30);
    expect(seen.request?.transcript).toContain("entry 30");
    expect(seen.request?.transcript).not.toContain("entry 1 ");
  });

  it("returns the search results plus answerError when the gateway fails", async () => {
    const failing: ThreadAskFn = () => Promise.reject(new Error("gateway HTTP 503"));
    const result = await run({ query: "NEEDLE", question: "why?" }, { ask: failing });
    const body = structured(result);

    expect(result.isError).toBeUndefined();
    expect(body.totalMatches).toBe(1);
    expect((body.matches as Array<Record<string, unknown>>)[0]!.message_id).toBe("m4");
    expect(body.answer).toBeUndefined();
    expect(String(body.answerError)).toContain("gateway HTTP 503");
  });

  it("requires a query or a question", async () => {
    const result = await run({});
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("requires a non-empty 'query' or 'question'");
  });
});

describe("thread ask prompt shape (gateway prompt-cache prefix)", () => {
  const messages = buildThreadAskMessages({ question: "why?", transcript: "SLICE-MARKER" });

  it("puts the fixed system prompt first and the question LAST", () => {
    // Reordering these destroys the cached KV prefix on every call — the
    // regression this test exists to catch.
    expect(messages[0]?.role).toBe("system");
    expect(messages[0]?.content).toBe(T3TEAM_ASK_SYSTEM_PROMPT);
    const transcriptIndex = messages.findIndex((message) =>
      message.content.includes("SLICE-MARKER"),
    );
    const questionIndex = messages.findIndex((message) => message.content.includes("why?"));
    expect(transcriptIndex).toBeGreaterThan(0);
    expect(questionIndex).toBe(messages.length - 1);
    expect(questionIndex).toBeGreaterThan(transcriptIndex);
  });

  it("keeps the system prompt free of variable content", () => {
    const again = buildThreadAskMessages({ question: "different", transcript: "other" });
    expect(again[0]?.content).toBe(messages[0]?.content);
    expect(T3TEAM_ASK_SYSTEM_PROMPT).not.toMatch(/\d{4}-\d{2}-\d{2}|thread-|\bid\b/i);
  });
});

describe("thread ask — budget and citation hardening", () => {
  it("does not read a citation out of quoted transcript text", async () => {
    // The model quotes a line that contains the words "position 4". Parsing
    // prose produced a confident, wrong citation of entry 4.
    const { ask } = recordingAsk(
      "It threw `SyntaxError: Unexpected token u in JSON at position 4` [[cite:2]].",
    );
    const body = structured(await run({ query: "NEEDLE", question: "what threw?" }, { ask }));
    expect(body.citations).toEqual([{ position: 2, source: "message", id: "m2" }]);
  });

  it("counts non-ASCII text at about one token per character", () => {
    // chars/4 undercounts CJK by ~4x, which overshoots the real model limit.
    expect(estimateAskTokens("abcd".repeat(100))).toBe(100);
    expect(estimateAskTokens("日本語テキスト")).toBe(7);
  });

  it("caps a single outsized entry and reports the span as truncated", () => {
    const huge = "x".repeat(T3TEAM_ASK_MAX_ENTRY_CHARS * 3);
    const rendered = renderAskEntry({
      id: "m1",
      source: "message",
      label: "user",
      text: huge,
      position: 1,
    });
    expect(rendered.length).toBeLessThan(huge.length);
    expect(rendered).toContain("characters elided from the middle");
    // Both ends survive, so a verdict printed at the end is still readable.
    expect(rendered.endsWith("x")).toBe(true);
  });
});
