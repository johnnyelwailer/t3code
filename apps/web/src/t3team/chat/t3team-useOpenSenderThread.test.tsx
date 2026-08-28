// @vitest-environment jsdom
import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import { ThreadId, type EnvironmentId } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
}));

import { useRightPanelStore } from "~/rightPanelStore";
import { useT3TeamOpenSenderThread } from "./t3team-useOpenSenderThread";

const refA = scopeThreadRef("env-1" as EnvironmentId, ThreadId.make("thread-A"));

beforeEach(() => {
  mockNavigate.mockReset();
  useRightPanelStore.setState({ byThreadKey: {} });
});

function callHook(
  parentThreadId: string,
  activeThreadRef: Parameters<typeof useT3TeamOpenSenderThread>[1],
  embeddedMode: boolean,
) {
  let captured: ReturnType<typeof useT3TeamOpenSenderThread> | undefined;
  function Probe() {
    captured = useT3TeamOpenSenderThread(parentThreadId, activeThreadRef, embeddedMode);
    return null;
  }
  renderToStaticMarkup(<Probe />);
  if (captured === undefined) {
    throw new Error("Expected the probe render to capture the hook callback.");
  }
  return captured;
}

describe("useT3TeamOpenSenderThread", () => {
  it("is a no-op when the peer is the thread itself", () => {
    const open = callHook("thread-A", refA, false);

    open({ projectId: "project-1", threadId: "thread-A" });

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(useRightPanelStore.getState().byThreadKey).toEqual({});
  });

  it("opens the peer as a side-chat tab in this thread's right panel (no navigation)", () => {
    const open = callHook("thread-A", refA, false);

    open({ projectId: "project-1", threadId: "thread-B" });

    expect(mockNavigate).not.toHaveBeenCalled();
    const state = useRightPanelStore.getState().byThreadKey[scopedThreadKey(refA)];
    expect(state?.surfaces).toEqual([
      { id: "thread:thread-B", kind: "thread", threadId: "thread-B", environmentId: "env-1" },
    ]);
    expect(state?.activeSurfaceId).toBe("thread:thread-B");
    expect(state?.isOpen).toBe(true);
  });

  it("navigates to the peer instead when this pane is embedded and owns no right panel", () => {
    const open = callHook("thread-A", refA, true);

    open({ projectId: "project-1", threadId: "thread-B" });

    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/t3team/projects/$projectId/threads/$threadId",
      params: { projectId: "project-1", threadId: "thread-B" },
    });
    expect(useRightPanelStore.getState().byThreadKey).toEqual({});
  });

  it("falls back to navigation when the thread's ref is not resolved yet", () => {
    const open = callHook("thread-A", null, false);

    open({ projectId: "project-1", threadId: "thread-B" });

    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/t3team/projects/$projectId/threads/$threadId",
      params: { projectId: "project-1", threadId: "thread-B" },
    });
    expect(useRightPanelStore.getState().byThreadKey).toEqual({});
  });
});
