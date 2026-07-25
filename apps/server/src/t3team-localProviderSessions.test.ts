import { describe, expect, it } from "@effect/vitest";

import {
  parseClaudeLocalSession,
  parseCodexLocalSession,
  normalizeWorkspacePath,
  workspacePathsMatch,
} from "./t3team-localProviderSessions.ts";

describe("local provider session parsing", () => {
  it("reads a resumable Codex profile session", () => {
    const session = parseCodexLocalSession(
      [
        '{"timestamp":"2026-07-25T12:00:00.000Z","type":"session_meta","payload":{"id":"codex-native-id","cwd":"/repo","gitBranch":"feature/session-import"}}',
        '{"timestamp":"2026-07-25T12:00:00.500Z","type":"turn_context","payload":{"model":"gpt-5.6-terra"}}',
        '{"timestamp":"2026-07-25T12:00:01.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"text":"Fix the thing"}]}}',
      ].join("\n"),
    );

    expect(session).toMatchObject({
      provider: "codex",
      nativeId: "codex-native-id",
      cwd: "/repo",
      branch: "feature/session-import",
      model: "gpt-5.6-terra",
      title: "Fix the thing",
    });
  });

  it("reads a resumable Claude profile session", () => {
    const session = parseClaudeLocalSession(
      '{"sessionId":"claude-native-id","cwd":"/repo","gitBranch":"feature/session-import","timestamp":"2026-07-25T12:00:00.000Z","message":{"role":"assistant","model":"claude-opus-5","content":[{"text":"Done"}]}}',
    );

    expect(session).toMatchObject({
      provider: "claudeAgent",
      nativeId: "claude-native-id",
      cwd: "/repo",
      branch: "feature/session-import",
      model: "claude-opus-5",
      messages: [{ nativeIndex: 0, role: "assistant", text: "Done" }],
    });
  });

  it("matches Windows workspace paths without case or slash sensitivity", () => {
    expect(workspacePathsMatch("C:\\Dev\\App\\", "c:/dev/app", "win32")).toBe(true);
    expect(normalizeWorkspacePath("C:\\Dev\\App\\", "win32")).toBe("c:\\dev\\app");
    expect(workspacePathsMatch("/Users/pj/app", "/users/pj/app", "darwin")).toBe(false);
  });
});
