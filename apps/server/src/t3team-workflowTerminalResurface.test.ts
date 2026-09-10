// @effect-diagnostics globalDate:off - test fixtures stamp relative timestamps.
// @effect-diagnostics globalConsole:off - test-only dispatch spy.
/**
 * Terminal-notice resurfacing: a failure notice posted while the launch turn is still active
 * is buried in that turn; when the thread's session goes idle the reactor must re-anchor it
 * (same stable message id, fresh timestamp) so the launch thread actually sees the outcome.
 */
import { ThreadId, type OrchestrationCommand, type OrchestrationEvent } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { describe, expect, it } from "vite-plus/test";

import { makeTerminalNoticeResurfer } from "./t3team-workflowTerminalResurface.ts";

type SessionSetEvent = Extract<OrchestrationEvent, { type: "thread.session-set" }>;

type Row = {
  readonly runId: string;
  readonly launchThreadId: string | null;
  readonly status: string;
  readonly origin: string;
  readonly updatedAt: string;
  readonly failureReason: string | null;
  readonly pendingKind: string | null;
};

const ROWS: Row[] = [
  {
    runId: "run-fresh-failed",
    launchThreadId: "thread-a",
    status: "failed",
    origin: "ephemeral",
    updatedAt: new Date(Date.now() - 20_000).toISOString(),
    failureReason: "SyntaxError: Invalid or unexpected token",
    pendingKind: null,
  },
  {
    runId: "run-old-failed",
    launchThreadId: "thread-a",
    status: "failed",
    origin: "ephemeral",
    updatedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    failureReason: "ancient failure",
    pendingKind: null,
  },
  {
    runId: "run-completed",
    launchThreadId: "thread-a",
    status: "completed",
    origin: "ephemeral",
    updatedAt: new Date(Date.now() - 10_000).toISOString(),
    failureReason: null,
    pendingKind: null,
  },
  {
    runId: "run-other-thread",
    launchThreadId: "thread-b",
    status: "failed",
    origin: "ephemeral",
    updatedAt: new Date(Date.now() - 5_000).toISOString(),
    failureReason: "someone else's failure",
    pendingKind: null,
  },
  {
    runId: "run-d-old-failed",
    launchThreadId: "thread-d",
    status: "failed",
    origin: "ephemeral",
    updatedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    failureReason: "a failure outside the resurface window",
    pendingKind: null,
  },
];

const sessionSet = (threadId: string, busy: boolean): SessionSetEvent =>
  ({
    sequence: 0,
    occurredAt: new Date().toISOString(),
    type: "thread.session-set" as const,
    payload: {
      threadId: ThreadId.make(threadId),
      session: {
        threadId: ThreadId.make(threadId),
        status: busy ? ("running" as const) : ("ready" as const),
        providerName: null,
        runtimeMode: "full-access" as const,
        activeTurnId: busy ? ("turn-1" as const) : null,
        lastError: null,
        updatedAt: new Date().toISOString(),
      },
    },
  }) as unknown as SessionSetEvent;

describe("makeTerminalNoticeResurfer", () => {
  it("re-posts the recent failed notice once, when the launch turn ends", async () => {
    const posted: Array<Extract<OrchestrationCommand, { type: "thread.message.upsert" }>> = [];
    const resurfer = makeTerminalNoticeResurfer({
      runRepo: {
        listRecent: () => Effect.succeed(ROWS),
      } as never,
      dispatch: async (command) => {
        if (command.type === "thread.message.upsert") posted.push(command);
      },
      nowIso: () => new Date().toISOString(),
      nowMs: () => Date.now(),
    });

    // Turn starts — no post.
    await Effect.runPromise(resurfer.onSessionSet(sessionSet("thread-a", true)));
    expect(posted).toEqual([]);

    // Idle churn before we ever saw the thread busy — no post (we cannot tell "the launch
    // turn ended" from "this thread was always idle").
    await Effect.runPromise(resurfer.onSessionSet(sessionSet("thread-b", false)));
    expect(posted).toEqual([]);

    // The launch turn ends — the recent failed run of THIS thread is re-anchored, exactly once.
    await Effect.runPromise(resurfer.onSessionSet(sessionSet("thread-a", false)));
    expect(posted.length).toBe(1);
    const message = posted[0]!.message;
    expect(String(message.messageId)).toBe("t3team-wf-result:run-fresh-failed");
    expect(message.text).toContain("⚠️ The orchestration stopped");
    expect(message.text).toContain("SyntaxError: Invalid or unexpected token");

    // A further idle transition must not re-post (idempotent per run per uptime).
    await Effect.runPromise(resurfer.onSessionSet(sessionSet("thread-a", false)));
    expect(posted.length).toBe(1);
  });

  it("ignores failures outside the recent window and runs of other threads", async () => {
    const posted: unknown[] = [];
    const resurfer = makeTerminalNoticeResurfer({
      runRepo: {
        listRecent: () => Effect.succeed(ROWS),
      } as never,
      dispatch: async (command) => {
        if (command.type === "thread.message.upsert") posted.push(command);
      },
      nowIso: () => new Date().toISOString(),
      nowMs: () => Date.now(),
    });
    // thread-b: its only failure belongs to it and is recent → exactly one post.
    await Effect.runPromise(resurfer.onSessionSet(sessionSet("thread-b", true)));
    await Effect.runPromise(resurfer.onSessionSet(sessionSet("thread-b", false)));
    // thread-c: we saw it busy, it goes idle, but it has NO failed run at all → no post.
    await Effect.runPromise(resurfer.onSessionSet(sessionSet("thread-c", true)));
    await Effect.runPromise(resurfer.onSessionSet(sessionSet("thread-c", false)));
    // thread-d: its only failure is 3h old — outside the recent window → no post.
    await Effect.runPromise(resurfer.onSessionSet(sessionSet("thread-d", true)));
    await Effect.runPromise(resurfer.onSessionSet(sessionSet("thread-d", false)));
    const ids = posted.map((c) =>
      String((c as { message: { messageId: string } }).message.messageId),
    );
    expect(ids).toEqual(["t3team-wf-result:run-other-thread"]);
  });
});
