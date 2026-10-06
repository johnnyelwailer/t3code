import { describe, expect, it } from "vite-plus/test";
import { ProviderInstanceId, ThreadId, type OrchestrationV2RunStatus } from "@t3tools/contracts";
import { deriveThreadRunState } from "@t3tools/shared/t3team-threadRunStatus";

import { mapLiveThreadToProjectThread } from "./t3team-threadBridge";
import { makeLiveThreadShell } from "./t3team-threadBridge.testSupport";

// GHE #52 — active-children live sync. The ProjectThread status the active-children indicator
// (and the sidebar dots) key on must agree with the canonical primitive `deriveThreadRunState`
// whenever it reads a thread as running, or a working child stays invisible to the indicator.
describe("mapLiveThreadToProjectThread — live running status (GHE #52)", () => {
  const base = makeLiveThreadShell({
    id: ThreadId.make("thread-child"),
    title: "Child work",
    createdAt: "2026-06-14T09:00:00.000Z",
    updatedAt: "2026-06-14T10:00:00.000Z",
  });
  const withRuntime = (status: OrchestrationV2RunStatus | "idle") => ({
    ...base,
    runtime: {
      status,
      activeRunId: null,
      providerInstanceId: ProviderInstanceId.make("codex"),
      providerName: null,
      lastError: null,
      updatedAt: "2026-06-14T10:00:00.000Z",
    },
  });

  it("still reads a thread with no run as idle", () => {
    expect(mapLiveThreadToProjectThread({ ...base, runtime: null }).status).toBe("idle");
  });

  it("agrees with deriveThreadRunState whenever the canonical primitive says running", () => {
    const statuses: ReadonlyArray<OrchestrationV2RunStatus> = [
      "preparing",
      "queued",
      "starting",
      "running",
      "waiting",
    ];
    for (const status of statuses) {
      expect(deriveThreadRunState({ status })).toBe("running");
      expect(mapLiveThreadToProjectThread(withRuntime(status)).status).toBe("running");
    }
  });

  it("reads non-subagent background work after the run settled as running", () => {
    const projectThread = mapLiveThreadToProjectThread({
      ...withRuntime("idle"),
      pendingBackgroundTasks: [{ kind: "command" } as (typeof base.pendingBackgroundTasks)[number]],
    });
    expect(projectThread.status).toBe("running");
  });
});
