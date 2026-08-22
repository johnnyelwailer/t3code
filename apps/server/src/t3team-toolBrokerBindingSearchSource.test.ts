/* oxlint-disable t3code/no-manual-effect-runtime-in-tests -- handler unit test bridges Effect for plain assertion-style tests; no layer under test. */
import { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { describe, expect, it } from "vite-plus/test";

import { callT3TeamSearchSourceTool } from "./t3team-toolBrokerBindingSearchSource.ts";
import type { SearchSourceThreadDetail } from "./t3team-toolBrokerBindingSearchSource.ts";

const currentThreadId = ThreadId.make("thread-current");
const sourceThreadId = ThreadId.make("thread-source");

const sourceThread: SearchSourceThreadDetail = {
  title: "Original thread",
  messages: [
    { id: "s1", role: "user", text: "Fix the login bug" },
    { id: "s2", role: "assistant", text: "I found the issue in auth.ts" },
    { id: "s3", role: "user", text: "Now handle the AUTH edge case for SSO" },
    { id: "s4", role: "assistant", text: "Done." },
  ],
};

const forkedThread: SearchSourceThreadDetail = {
  title: "Original thread (fork)",
  messages: [
    {
      id: "c1",
      role: "system",
      text: "This thread was forked from ...",
      t3teamExt: { forkSource: { threadId: "thread-source" } },
    },
    { id: "c2", role: "user", text: "continue" },
  ],
};

const run = (
  toolArgs: unknown,
  overrides?: Partial<{
    threadId: ThreadId;
    loadThreadDetail: (
      threadId: ThreadId,
    ) => Effect.Effect<SearchSourceThreadDetail | undefined, string>;
  }>,
) =>
  Effect.runPromise(
    callT3TeamSearchSourceTool({
      tool: "t3team.thread.search_source",
      scopeLabel: "for this thread.",
      toolArgs,
      threadId: overrides?.threadId ?? currentThreadId,
      loadThreadDetail:
        overrides?.loadThreadDetail ??
        ((id) =>
          Effect.succeed(
            id === currentThreadId
              ? forkedThread
              : id === sourceThreadId
                ? sourceThread
                : undefined,
          )),
    }),
  );

const structured = (result: Awaited<ReturnType<typeof run>>) =>
  result.structuredContent as Record<string, unknown>;

describe("callT3TeamSearchSourceTool", () => {
  it("rejects when no handler is wired", async () => {
    const result = await Effect.runPromise(
      callT3TeamSearchSourceTool({
        tool: "t3team.thread.search_source",
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

  it("errors when the current thread has no fork source", async () => {
    const result = await run(
      { query: "auth" },
      {
        loadThreadDetail: (id) =>
          Effect.succeed(
            id === currentThreadId
              ? { messages: [{ id: "x", role: "user", text: "hi" }] }
              : undefined,
          ),
      },
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("no fork source");
  });

  it("errors when the source thread is gone", async () => {
    const result = await run(
      { query: "auth" },
      {
        loadThreadDetail: (id) => Effect.succeed(id === currentThreadId ? forkedThread : undefined),
      },
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("no longer available");
  });

  it("surfaces read failures as tool errors", async () => {
    const result = await run({ query: "auth" }, { loadThreadDetail: () => Effect.fail("db down") });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("db down");
  });

  it("finds case-insensitive matches with position, role, and snippet", async () => {
    const result = await run({ query: "auth" });
    expect(result.isError).toBeUndefined();
    const body = structured(result);
    expect(body.sourceThreadId).toBe("thread-source");
    expect(body.sourceThreadTitle).toBe("Original thread");
    expect(body.totalMatches).toBe(2);
    const matches = body.matches as Array<Record<string, unknown>>;
    expect(matches).toHaveLength(2);
    expect(matches[0]!.index).toBe(2);
    expect(matches[0]!.role).toBe("assistant");
    expect(String(matches[0]!.snippet)).toContain("auth.ts");
    expect(matches[1]!.index).toBe(3);
  });

  it("reports zero matches with a hint", async () => {
    const result = await run({ query: "zebra" });
    const body = structured(result);
    expect(body.totalMatches).toBe(0);
    expect(body.matches).toEqual([]);
    expect(body.hint).toContain("zebra");
  });

  it("caps the match limit at 25 and floors it at 1", async () => {
    const many: SearchSourceThreadDetail = {
      messages: Array.from({ length: 30 }, (_, i) => ({
        id: `m${i}`,
        role: "user",
        text: "needle here",
      })),
    };
    const result = await run(
      { query: "needle", limit: 999 },
      {
        loadThreadDetail: (id) => Effect.succeed(id === currentThreadId ? forkedThread : many),
      },
    );
    const body = structured(result);
    expect(body.totalMatches).toBe(30);
    expect(body.returnedMatches).toBe(25);
  });
});
