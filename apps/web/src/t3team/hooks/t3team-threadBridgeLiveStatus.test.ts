import { describe, expect, it } from "vite-plus/test";
import { ProjectId, type EnvironmentId } from "@t3tools/contracts";
import { deriveThreadRunState } from "@t3tools/shared/t3team-threadRunStatus";

import { mapLiveThreadToProjectThread } from "./t3team-threadBridge";

// GHE #52 — active-children live sync. The ProjectThread status the active-children
// indicator (and the sidebar dots) key on must agree with the canonical server
// primitive `deriveThreadRunState` whenever that primitive reads a thread as
// running, or a child that is working without a live provider session (turn in
// flight before session start, or native background work after the turn settled)
// stays invisible to the indicator.
describe("mapLiveThreadToProjectThread — live running status (GHE #52)", () => {
  const base = {
    id: "thread-child",
    projectId: ProjectId.make("live-saved"),
    title: "Child work",
    messages: [],
    activities: [],
    archivedAt: null,
    error: null,
    createdAt: "2026-06-14T09:00:00.000Z",
    updatedAt: "2026-06-14T10:00:00.000Z",
    environmentId: "env-local" as EnvironmentId,
    defaultModelSelection: null,
  };

  it("reads a child as running when its turn is in flight but the session has not started yet", () => {
    const projectThread = mapLiveThreadToProjectThread({
      ...base,
      latestTurn: { state: "running", startedAt: "2026-06-14T10:00:00.000Z" },
      session: null,
    } as never);

    expect(projectThread.status).toBe("running");
  });

  it("reads a child as running on native background liveness after the turn settled", () => {
    const projectThread = mapLiveThreadToProjectThread({
      ...base,
      latestTurn: { state: "completed", completedAt: "2026-06-14T10:05:00.000Z" },
      session: null,
      backgroundLiveness: "working",
    } as never);

    expect(projectThread.status).toBe("running");
  });

  it("still reads a plain idle thread as idle", () => {
    const projectThread = mapLiveThreadToProjectThread({
      ...base,
      latestTurn: null,
      session: null,
    } as never);

    expect(projectThread.status).toBe("idle");
  });

  it("agrees with deriveThreadRunState whenever the canonical primitive says running", () => {
    const cases: Array<{
      session: { status: string; lastError: string | null } | null;
      latestTurn: { state: string } | null;
      backgroundLiveness?: "working" | "monitoring";
    }> = [
      { session: { status: "running", lastError: null }, latestTurn: null },
      { session: { status: "starting", lastError: null }, latestTurn: null },
      { session: null, latestTurn: { state: "running" } },
      { session: { status: "idle", lastError: null }, latestTurn: { state: "running" } },
      {
        session: { status: "idle", lastError: null },
        latestTurn: { state: "completed" },
        backgroundLiveness: "working",
      },
      { session: null, latestTurn: { state: "completed" }, backgroundLiveness: "working" },
    ];
    for (const input of cases) {
      expect(deriveThreadRunState(input)).toBe("running");
      const projectThread = mapLiveThreadToProjectThread({
        ...base,
        session: input.session ? { ...input.session, activeTurnId: null } : null,
        latestTurn: input.latestTurn,
        ...(input.backgroundLiveness !== undefined
          ? { backgroundLiveness: input.backgroundLiveness }
          : {}),
      } as never);
      expect(projectThread.status).toBe("running");
    }
  });
});
