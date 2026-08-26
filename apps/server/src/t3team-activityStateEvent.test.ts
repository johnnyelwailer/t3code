import { describe, expect, it } from "vite-plus/test";

import {
  runtimeEventToActivityStateEvent,
  type ActivityStateEvent,
} from "./t3team-activityStateEvent.ts";

const base = {
  eventId: "evt-1",
  provider: "anthropic",
  threadId: "thread-1",
  createdAt: "2026-05-22T10:00:00.000Z",
} as const;

const event = (
  type: string,
  payload: Record<string, unknown>,
): Parameters<typeof runtimeEventToActivityStateEvent>[0] => ({ ...base, type, payload }) as never;

const type = (observation: ActivityStateEvent | null) => observation?.type ?? null;

describe("runtimeEventToActivityStateEvent (GHE #208)", () => {
  it("classifies reasoning vs. assistant vs. neutral content deltas by streamKind", () => {
    expect(
      type(
        runtimeEventToActivityStateEvent(
          event("content.delta", { streamKind: "reasoning_text", delta: "hmm" }),
        ),
      ),
    ).toBe("reasoning-delta");
    expect(
      type(
        runtimeEventToActivityStateEvent(
          event("content.delta", { streamKind: "reasoning_summary_text", delta: "hmm" }),
        ),
      ),
    ).toBe("reasoning-delta");
    expect(
      type(
        runtimeEventToActivityStateEvent(
          event("content.delta", { streamKind: "assistant_text", delta: "ok" }),
        ),
      ),
    ).toBe("assistant-delta");
    // Tool/plan streams extend the idle gap but are not state boundaries.
    for (const streamKind of ["plan_text", "command_output", "file_change_output", "unknown"]) {
      expect(
        type(runtimeEventToActivityStateEvent(event("content.delta", { streamKind, delta: "x" }))),
      ).toBe("output");
    }
  });

  it("classifies item lifecycles via the neutral tool-lifecycle marker", () => {
    expect(
      type(
        runtimeEventToActivityStateEvent(event("item.started", { itemType: "command_execution" })),
      ),
    ).toBe("tool-started");
    expect(
      type(
        runtimeEventToActivityStateEvent(
          event("item.completed", { itemType: "command_execution" }),
        ),
      ),
    ).toBe("tool-completed");
    expect(
      type(runtimeEventToActivityStateEvent(event("item.started", { itemType: "reasoning" }))),
    ).toBe("reasoning-delta");
    expect(
      type(
        runtimeEventToActivityStateEvent(event("item.started", { itemType: "assistant_message" })),
      ),
    ).toBe("assistant-delta");
    // Non-lifecycle completions carry no state signal.
    expect(
      runtimeEventToActivityStateEvent(event("item.completed", { itemType: "assistant_message" })),
    ).toBeNull();
  });

  it("maps turn boundaries and user-decision blocks", () => {
    expect(type(runtimeEventToActivityStateEvent(event("turn.started", {})))).toBe("turn-started");
    expect(type(runtimeEventToActivityStateEvent(event("turn.completed", {})))).toBe("turn-ended");
    expect(type(runtimeEventToActivityStateEvent(event("turn.aborted", {})))).toBe("turn-ended");
    expect(type(runtimeEventToActivityStateEvent(event("session.exited", {})))).toBe("turn-ended");
    expect(type(runtimeEventToActivityStateEvent(event("user-input.requested", {})))).toBe(
      "input-requested",
    );
    expect(type(runtimeEventToActivityStateEvent(event("user-input.resolved", {})))).toBe(
      "input-resumed",
    );
    expect(
      type(
        runtimeEventToActivityStateEvent(
          event("request.opened", { requestType: "command_execution_approval" }),
        ),
      ),
    ).toBe("input-requested");
  });

  it("ignores events with no state signal", () => {
    for (const e of [
      event("turn.plan.updated", {}),
      event("auth.status", {}),
      event("account.rate-limits.updated", {}),
      event("mcp.status.updated", {}),
      event("thread.token-usage.updated", {}),
    ]) {
      expect(runtimeEventToActivityStateEvent(e)).toBeNull();
    }
    // tool.progress extends the idle gap.
    expect(
      type(runtimeEventToActivityStateEvent(event("tool.progress", { toolName: "bash" }))),
    ).toBe("output");
  });
});
