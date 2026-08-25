/* oxlint-disable t3code/no-manual-effect-runtime-in-tests -- handler unit test bridges Effect for plain assertion-style tests; no layer under test. */
import { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { describe, expect, it } from "vite-plus/test";

import { callT3TeamSearchThreadTool } from "./t3team-toolBrokerBindingSearchThread.ts";
import type { SearchThreadDetail } from "./t3team-toolBrokerBindingSearchThread.ts";

const threadId = ThreadId.make("thread-current");

const thread: SearchThreadDetail = {
  title: "Current thread",
  messages: [
    { id: "m1", role: "user", text: "Fix the login bug" },
    { id: "m2", role: "assistant", text: "I found the issue in auth.ts" },
    { id: "m3", role: "actor", text: "Upstream says the AUTH fix lands in 2.1" },
    { id: "m4", role: "user", text: "Now handle the AUTH edge case for SSO" },
    { id: "m5", role: "assistant", text: "Done." },
  ],
};

const run = (
  toolArgs: unknown,
  overrides?: Partial<{
    threadId: ThreadId;
    loadThreadDetail: (threadId: ThreadId) => Effect.Effect<SearchThreadDetail | undefined, string>;
  }>,
) =>
  Effect.runPromise(
    callT3TeamSearchThreadTool({
      tool: "t3team.thread.search",
      scopeLabel: "for this thread.",
      toolArgs,
      threadId: overrides?.threadId ?? threadId,
      loadThreadDetail:
        overrides?.loadThreadDetail ??
        ((id) => Effect.succeed(id === threadId ? thread : undefined)),
    }),
  );

const structured = (result: Awaited<ReturnType<typeof run>>) =>
  result.structuredContent as Record<string, unknown>;

describe("callT3TeamSearchThreadTool", () => {
  it("rejects when no handler is wired", async () => {
    const result = await Effect.runPromise(
      callT3TeamSearchThreadTool({
        tool: "t3team.thread.search",
        scopeLabel: "for this thread.",
        toolArgs: { query: "auth" },
      }),
    );
    expect(result.isError).toBe(true);
  });

  it("requires a non-empty query", async () => {
    const result = await run({ query: "   " });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("requires a non-empty 'query'");
  });

  it("errors when the current thread cannot be read", async () => {
    const result = await run(
      { query: "auth" },
      { loadThreadDetail: () => Effect.succeed(undefined) },
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Could not read the current thread");
  });

  it("surfaces read failures as tool errors", async () => {
    const result = await run({ query: "auth" }, { loadThreadDetail: () => Effect.fail("db down") });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("db down");
  });

  it("finds case-insensitive matches with position, role, snippet, and message_id", async () => {
    const result = await run({ query: "AUTH" });
    expect(result.isError).toBeUndefined();
    const body = structured(result);
    expect(body.totalMatches).toBe(3);
    expect(body.returnedMatches).toBe(3);
    const matches = body.matches as Array<Record<string, unknown>>;
    expect(matches).toHaveLength(3);
    expect(matches[0]!.position).toBe(2);
    expect(matches[0]!.role).toBe("assistant");
    expect(matches[0]!.message_id).toBe("m2");
    expect(String(matches[0]!.snippet)).toContain("auth.ts");
    expect(matches[1]!.position).toBe(3);
    expect(matches[1]!.message_id).toBe("m3");
    expect(matches[2]!.position).toBe(4);
    expect(matches[2]!.message_id).toBe("m4");
  });

  it("reports zero matches with a hint", async () => {
    const result = await run({ query: "zebra" });
    const body = structured(result);
    expect(body.totalMatches).toBe(0);
    expect(body.returnedMatches).toBe(0);
    expect(body.matches).toEqual([]);
    expect(body.hint).toContain("zebra");
  });

  it("respects the limit default of 10 and caps it at 25", async () => {
    const many: SearchThreadDetail = {
      messages: Array.from({ length: 30 }, (_, i) => ({
        id: `m${i}`,
        role: "user",
        text: "needle here",
      })),
    };
    const capped = await run(
      { query: "needle", limit: 999 },
      { loadThreadDetail: () => Effect.succeed(many) },
    );
    expect(capped.structuredContent).toEqual(
      expect.objectContaining({ totalMatches: 30, returnedMatches: 25 }),
    );

    const defaulted = await run(
      { query: "needle" },
      { loadThreadDetail: () => Effect.succeed(many) },
    );
    expect(defaulted.structuredContent).toEqual(
      expect.objectContaining({ totalMatches: 30, returnedMatches: 10 }),
    );
  });

  it("filters matches by role", async () => {
    const result = await run({ query: "auth", role: "actor" });
    const body = structured(result);
    expect(body.totalMatches).toBe(1);
    const matches = body.matches as Array<Record<string, unknown>>;
    expect(matches).toHaveLength(1);
    expect(matches[0]!.role).toBe("actor");
    expect(matches[0]!.message_id).toBe("m3");
  });

  it("ignores an invalid role filter", async () => {
    const result = await run({ query: "auth", role: "system" });
    const body = structured(result);
    expect(body.totalMatches).toBe(3);
  });
});
