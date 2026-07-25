import { describe, expect, it } from "@effect/vitest";

import { parseClaudeLocalSession, parseCodexLocalSession } from "./localProviderSessions.ts";

describe("local provider session parsing", () => {
  it("reads a resumable Codex profile session", () => {
    const session = parseCodexLocalSession(
      [
        '{"timestamp":"2026-07-25T12:00:00.000Z","type":"session_meta","payload":{"id":"codex-native-id","cwd":"/repo"}}',
        '{"timestamp":"2026-07-25T12:00:01.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"text":"Fix the thing"}]}}',
      ].join("\n"),
    );

    expect(session).toMatchObject({
      provider: "codex",
      nativeId: "codex-native-id",
      cwd: "/repo",
      title: "Fix the thing",
    });
  });

  it("reads a resumable Claude profile session", () => {
    const session = parseClaudeLocalSession(
      '{"sessionId":"claude-native-id","cwd":"/repo","timestamp":"2026-07-25T12:00:00.000Z","message":{"role":"assistant","content":[{"text":"Done"}]}}',
    );

    expect(session).toMatchObject({
      provider: "claudeAgent",
      nativeId: "claude-native-id",
      cwd: "/repo",
      messages: [{ role: "assistant", text: "Done" }],
    });
  });
});
