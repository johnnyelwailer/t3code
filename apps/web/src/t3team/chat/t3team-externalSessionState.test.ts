import { describe, expect, it } from "vite-plus/test";

import {
  CLAUDE_EXTERNAL_SESSION_FALLBACK_WINDOW_MS,
  filterLocalProviderSessionThreads,
  isExternalSessionActive,
  isLocalProviderSessionThread,
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

    expect(session).toEqual({
      provider: "codex",
      nativeId: "abc",
      updatedAt: "2026-07-25T12:02:00.000Z",
    });
  });

  it("locks only recently updated external sessions", () => {
    const now = Date.parse("2026-07-25T12:01:30.000Z");
    const session = {
      provider: "claudeAgent" as const,
      nativeId: "abc",
      updatedAt: "2026-07-25T12:01:00.000Z",
    };

    expect(isExternalSessionActive(session, now)).toBe(true);
    expect(isExternalSessionActive(session, now + CLAUDE_EXTERNAL_SESSION_FALLBACK_WINDOW_MS)).toBe(
      false,
    );
  });

  it("marks a thread as a local provider session only by its providerKind", () => {
    expect(isLocalProviderSessionThread({ providerKind: "codex" })).toBe(true);
    expect(isLocalProviderSessionThread({ providerKind: "claudeAgent" })).toBe(true);
    // App-managed threads never carry providerKind, even on the same providers.
    expect(isLocalProviderSessionThread({})).toBe(false);
    expect(isLocalProviderSessionThread(null)).toBe(false);
    expect(isLocalProviderSessionThread(undefined)).toBe(false);
  });

  it("hides adopted sessions when the toggle is off and restores the same rows when on", () => {
    type ThreadRow = { id: string; title: string; providerKind?: string };
    const appThread: ThreadRow = { id: "t1", title: "Fix the build" };
    const codexSession: ThreadRow = { id: "t2", title: "codex session", providerKind: "codex" };
    const claudeSession: ThreadRow = {
      id: "t3",
      title: "claude session",
      providerKind: "claudeAgent",
    };
    const list: ThreadRow[] = [appThread, codexSession, claudeSession];

    const hidden = filterLocalProviderSessionThreads(list, false);
    expect(hidden).toEqual([appThread]);
    // Hide, not delete: the input list is untouched, so the store keeps the rows.
    expect(list).toEqual([appThread, codexSession, claudeSession]);

    // Toggle back on: the existing rows come back, same content and order, no re-sync.
    const restored = filterLocalProviderSessionThreads(hidden, true);
    expect(restored).toEqual(hidden);
    const cycleOff = filterLocalProviderSessionThreads(restored, false);
    expect(cycleOff).toEqual([appThread]);
  });

  it("leaves lists without adopted sessions unchanged in either direction", () => {
    type ThreadRow = { id: string; providerKind?: string | undefined };
    const list: ThreadRow[] = [{ id: "t1" }, { id: "t2", providerKind: undefined }];
    expect(filterLocalProviderSessionThreads(list, false)).toEqual(list);
    expect(filterLocalProviderSessionThreads(list, true)).toEqual(list);
  });
});
