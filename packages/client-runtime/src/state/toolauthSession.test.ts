import type { ToolAuthState } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { applyToolAuthStreamEvent, EMPTY_TOOLAUTH_STATES } from "./toolauthSession.ts";

const claudeIdle: ToolAuthState = { tool: "claude", phase: "idle" };
const codexIdle: ToolAuthState = { tool: "codex", phase: "idle" };

describe("applyToolAuthStreamEvent", () => {
  it("a snapshot event replaces the map outright, keyed by tool", () => {
    const next = applyToolAuthStreamEvent(EMPTY_TOOLAUTH_STATES, {
      type: "snapshot",
      tools: [claudeIdle, codexIdle],
    });
    expect(next.get("claude")).toEqual(claudeIdle);
    expect(next.get("codex")).toEqual(codexIdle);
    expect(next.size).toBe(2);
  });

  it("an update event only touches its own tool, leaving the rest of the map alone", () => {
    const snapshot = applyToolAuthStreamEvent(EMPTY_TOOLAUTH_STATES, {
      type: "snapshot",
      tools: [claudeIdle, codexIdle],
    });
    const claudeConnected: ToolAuthState = { tool: "claude", phase: "connected", account: "me" };
    const next = applyToolAuthStreamEvent(snapshot, { type: "update", state: claudeConnected });

    expect(next.get("claude")).toEqual(claudeConnected);
    expect(next.get("codex")).toEqual(codexIdle);
    expect(next).not.toBe(snapshot);
  });

  it("a later snapshot fully replaces prior per-tool updates", () => {
    const afterUpdate = applyToolAuthStreamEvent(EMPTY_TOOLAUTH_STATES, {
      type: "update",
      state: { tool: "claude", phase: "verifying" },
    });
    const next = applyToolAuthStreamEvent(afterUpdate, { type: "snapshot", tools: [claudeIdle] });
    expect(next.get("claude")).toEqual(claudeIdle);
  });
});
