// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { useRightPanelStore } from "~/rightPanelStore";

const navigate = vi.fn();
const selectStandaloneThread = vi.fn();
let capturedOnBack: (() => void) | undefined;

vi.mock("@tanstack/react-router", () => ({
  useCanGoBack: () => true,
  useNavigate: () => navigate,
}));
vi.mock("~/t3team/hooks/t3team-useProjectStore", () => ({
  useProjectStore: () => ({ selectStandaloneThread }),
}));
vi.mock("~/t3team/chat/t3team-ThreadChatView", () => ({
  ThreadChatView: ({ threadId, onBack }: { threadId: string; onBack?: () => void }) => {
    capturedOnBack = onBack;
    return <div>chat:{threadId}</div>;
  },
}));

import { AppThreadPane } from "./t3team-AppThreadPane";

const baseProps = {
  threadProject: null,
  resolvedThread: null,
  onOpenTicket: () => {},
  onOpenEmbeddedThread: () => {},
  onThreadKickoffConsumed: () => {},
  onRememberFullThread: () => {},
  onBackToDashboard: () => {},
} as const;

function mountWithEffects(node: ReactNode): Root {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(node);
  });
  return root;
}

beforeEach(() => {
  useRightPanelStore.setState({ byThreadKey: {} });
  navigate.mockReset();
  selectStandaloneThread.mockReset();
  capturedOnBack = undefined;
});

describe("AppThreadPane (side chat)", () => {
  it("no longer renders the custom side-by-side split pane", () => {
    const markup = renderToStaticMarkup(
      <AppThreadPane
        view={{
          type: "thread",
          projectId: "project-1",
          threadId: "parent-thread",
          embeddedThreadId: "child-thread",
        }}
        {...baseProps}
      />,
    );

    expect(markup).not.toContain("t3team-embedded-thread-pane");
    expect(markup).not.toContain('aria-label="Close side-by-side thread"');
    expect(markup).toContain("chat:parent-thread");
  });

  it("Back on a subagent replaces onto the parent instead of history.back", () => {
    const historyBack = vi.fn();
    const originalWindow = globalThis.window;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { history: { back: historyBack } },
    });

    try {
      const root = mountWithEffects(
        <AppThreadPane
          view={{
            type: "thread",
            projectId: "project-1",
            threadId: "child-thread",
          }}
          {...baseProps}
          resolvedThread={{
            id: "child-thread",
            projectId: "project-1",
            title: "Child",
            status: "idle",
            createdAt: "2026-10-07T00:00:00.000Z",
            lastMessageAt: "2026-10-07T00:00:00.000Z",
            parentThreadId: "parent-thread",
          }}
        />,
      );

      expect(capturedOnBack).toBeTypeOf("function");
      act(() => {
        capturedOnBack?.();
      });
      act(() => root.unmount());
    } finally {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
      });
    }

    expect(historyBack).not.toHaveBeenCalled();
    expect(selectStandaloneThread).toHaveBeenCalledWith("project-1", "parent-thread");
    expect(navigate).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "/t3team/projects/$projectId/threads/$threadId",
        params: { projectId: "project-1", threadId: "parent-thread" },
        replace: true,
      }),
    );
  });
});
