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
    expect(body.matchMode).toBe("verbatim");
    const matches = body.matches as Array<Record<string, unknown>>;
    expect(matches).toHaveLength(3);
    // Newest first: m4, m3, m2.
    expect(matches[0]!.position).toBe(4);
    expect(matches[0]!.message_id).toBe("m4");
    expect(matches[0]!.source).toBe("message");
    expect(matches[1]!.position).toBe(3);
    expect(matches[1]!.message_id).toBe("m3");
    expect(matches[2]!.position).toBe(2);
    expect(matches[2]!.role).toBe("assistant");
    expect(matches[2]!.message_id).toBe("m2");
    expect(String(matches[2]!.snippet)).toContain("auth.ts");
  });

  it("returns the newest matches first, and the oldest on request", async () => {
    const recent = structured(await run({ query: "auth", limit: 1 }));
    expect((recent.matches as Array<Record<string, unknown>>)[0]!.message_id).toBe("m4");
    expect(recent.hasMore).toBe(true);

    const oldest = structured(await run({ query: "auth", limit: 1, order: "oldest" }));
    expect((oldest.matches as Array<Record<string, unknown>>)[0]!.message_id).toBe("m2");
  });

  it("pages with offset in the requested order", async () => {
    const page2 = structured(await run({ query: "auth", limit: 1, offset: 1 }));
    const matches = page2.matches as Array<Record<string, unknown>>;
    expect(matches).toHaveLength(1);
    expect(matches[0]!.message_id).toBe("m3");
    expect(page2.totalMatches).toBe(3);
    expect(page2.hasMore).toBe(true);

    const last = structured(await run({ query: "auth", limit: 1, offset: 2 }));
    expect((last.matches as Array<Record<string, unknown>>)[0]!.message_id).toBe("m2");
    expect(last.hasMore).toBe(false);
  });

  it("searches tool activity — commands, their output, and the tool kind", async () => {
    const withActivity: SearchThreadDetail = {
      messages: [{ id: "m1", role: "user", text: "run the migration" }],
      activities: [
        {
          id: "a1",
          kind: "bash",
          summary: "npm run migrate",
          payload: { detail: "Error: relation thread_task_records already exists" },
        },
      ],
    };
    const load = () => Effect.succeed(withActivity);

    const byOutput = structured(await run({ query: "already exists" }, { loadThreadDetail: load }));
    expect(byOutput.totalMatches).toBe(1);
    const matches = byOutput.matches as Array<Record<string, unknown>>;
    expect(matches[0]!.source).toBe("activity");
    // An activity id is not usable with read_message, so it is reported under
    // its own key rather than masquerading as a message id.
    expect(matches[0]!.activity_id).toBe("a1");
    expect(matches[0]!.message_id).toBeUndefined();
    expect(matches[0]!.role).toBe("bash");

    const byKind = structured(await run({ query: "bash" }, { loadThreadDetail: load }));
    expect(byKind.totalMatches).toBe(1);
  });

  it("ranks messages and activities by time, not by stream", async () => {
    // The activity is older than the message. Appending activities after
    // messages and reversing would rank the stale activity first.
    const interleaved: SearchThreadDetail = {
      messages: [{ id: "m1", role: "user", text: "needle", createdAt: "2026-09-11T10:00:00.000Z" }],
      activities: [
        { id: "a1", kind: "bash", summary: "needle", createdAt: "2026-09-01T10:00:00.000Z" },
      ],
    };
    const load = () => Effect.succeed(interleaved);

    const newest = structured(await run({ query: "needle", limit: 1 }, { loadThreadDetail: load }));
    expect((newest.matches as Array<Record<string, unknown>>)[0]!.message_id).toBe("m1");

    const oldest = structured(
      await run({ query: "needle", limit: 1, order: "oldest" }, { loadThreadDetail: load }),
    );
    expect((oldest.matches as Array<Record<string, unknown>>)[0]!.activity_id).toBe("a1");
  });

  it("does not let one- or two-letter terms drive the all-terms fallback", async () => {
    const noise: SearchThreadDetail = {
      messages: [],
      activities: [{ id: "a1", kind: "bash", summary: "needle" }],
    };
    // "a" and "b" both occur inside "bash"; matching on them would return an
    // entry containing none of the query's actual words.
    const result = structured(
      await run({ query: "a b" }, { loadThreadDetail: () => Effect.succeed(noise) }),
    );
    expect(result.totalMatches).toBe(0);
  });

  it("scopes the search to messages or activities", async () => {
    const both: SearchThreadDetail = {
      messages: [{ id: "m1", role: "user", text: "needle in a message" }],
      activities: [{ id: "a1", kind: "bash", summary: "needle in a command" }],
    };
    const load = () => Effect.succeed(both);

    expect(
      structured(await run({ query: "needle" }, { loadThreadDetail: load })).totalMatches,
    ).toBe(2);
    const messagesOnly = structured(
      await run({ query: "needle", scope: "messages" }, { loadThreadDetail: load }),
    );
    expect(messagesOnly.totalMatches).toBe(1);
    expect((messagesOnly.matches as Array<Record<string, unknown>>)[0]!.source).toBe("message");
    const activitiesOnly = structured(
      await run({ query: "needle", scope: "activities" }, { loadThreadDetail: load }),
    );
    expect(activitiesOnly.totalMatches).toBe(1);
    expect((activitiesOnly.matches as Array<Record<string, unknown>>)[0]!.source).toBe("activity");
  });

  it("retries a multi-word query as all-terms when nothing matches verbatim", async () => {
    const result = structured(await run({ query: "SSO edge case" }));
    // "SSO edge case" appears nowhere verbatim; m4 has "edge case for SSO".
    expect(result.matchMode).toBe("all-terms");
    expect(result.totalMatches).toBe(1);
    expect((result.matches as Array<Record<string, unknown>>)[0]!.message_id).toBe("m4");
  });

  it("prefers a verbatim match over the all-terms fallback", async () => {
    // "AUTH edge case" is present verbatim in m4, so the fallback must not run
    // even though the individual terms also occur in other messages.
    const exact = structured(await run({ query: "AUTH edge case" }));
    expect(exact.matchMode).toBe("verbatim");
    expect(exact.totalMatches).toBe(1);
    expect((exact.matches as Array<Record<string, unknown>>)[0]!.message_id).toBe("m4");

    // Same words, order that appears nowhere verbatim — only then does the
    // all-terms pass run, and it finds the message holding all of them.
    const reordered = structured(await run({ query: "edge AUTH case" }));
    expect(reordered.matchMode).toBe("all-terms");
    expect(reordered.totalMatches).toBe(1);
    expect((reordered.matches as Array<Record<string, unknown>>)[0]!.message_id).toBe("m4");
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

  it("treats the role filter as any message role or activity kind", async () => {
    const withActivity: SearchThreadDetail = {
      messages: [{ id: "m1", role: "user", text: "needle" }],
      activities: [{ id: "a1", kind: "bash", summary: "needle" }],
    };
    const byKind = structured(
      await run(
        { query: "needle", role: "bash" },
        { loadThreadDetail: () => Effect.succeed(withActivity) },
      ),
    );
    expect(byKind.totalMatches).toBe(1);
    expect((byKind.matches as Array<Record<string, unknown>>)[0]!.source).toBe("activity");

    // An unknown label matches nothing rather than being silently dropped —
    // a filter that quietly does not apply is worse than an empty result.
    const unknown = structured(await run({ query: "auth", role: "system" }));
    expect(unknown.totalMatches).toBe(0);
    expect(String(unknown.hint)).toContain("auth");
  });
});
