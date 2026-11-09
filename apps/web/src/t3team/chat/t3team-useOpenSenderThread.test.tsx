// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
}));

import { useRightPanelStore } from "~/rightPanelStore";
import { useT3TeamOpenSenderThread } from "./t3team-useOpenSenderThread";

beforeEach(() => {
  mockNavigate.mockReset();
  useRightPanelStore.setState({ byThreadKey: {} });
});

function callHook(parentThreadId: string) {
  let captured: ReturnType<typeof useT3TeamOpenSenderThread> | undefined;
  function Probe() {
    captured = useT3TeamOpenSenderThread(parentThreadId);
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
    const open = callHook("thread-A");

    open({ projectId: "project-1", threadId: "thread-A" });

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("navigates to the peer and leaves the right panel alone", () => {
    const open = callHook("thread-A");

    open({ projectId: "project-1", threadId: "thread-B" });

    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/t3team/projects/$projectId/threads/$threadId",
      params: { projectId: "project-1", threadId: "thread-B" },
    });
    expect(useRightPanelStore.getState().byThreadKey).toEqual({});
  });
});
