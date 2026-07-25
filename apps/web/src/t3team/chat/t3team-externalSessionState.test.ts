import { describe, expect, it } from "vite-plus/test";

import {
  CLAUDE_EXTERNAL_SESSION_FALLBACK_WINDOW_MS,
  isExternalSessionActive,
  readExternalSession,
} from "./t3team-externalSessionState";

describe("external session state", () => {
  it("finds an imported provider and its latest activity", () => {
    const session = readExternalSession({
      messages: [
        { id: "local:codex:abc:0", createdAt: "2026-07-25T12:00:00.000Z" },
        { id: "local:codex:abc:1", createdAt: "2026-07-25T12:01:00.000Z" },
      ],
      updatedAt: "2026-07-25T12:02:00.000Z",
      createdAt: "2026-07-25T10:00:00.000Z",
    } as never);

    expect(session).toEqual({ provider: "codex", nativeId: "abc", updatedAt: "2026-07-25T12:02:00.000Z" });
  });

  it("locks only recently updated external sessions", () => {
    const now = Date.parse("2026-07-25T12:01:30.000Z");
    const session = { provider: "claudeAgent" as const, nativeId: "abc", updatedAt: "2026-07-25T12:01:00.000Z" };

    expect(isExternalSessionActive(session, now)).toBe(true);
    expect(isExternalSessionActive(session, now + CLAUDE_EXTERNAL_SESSION_FALLBACK_WINDOW_MS)).toBe(false);
  });
});
