// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";

import { useRightPanelStore, selectThreadRightPanelState } from "~/rightPanelStore";

vi.mock("@tanstack/react-router", () => ({ useCanGoBack: () => false }));
vi.mock("~/state/environments", () => ({
  usePrimaryEnvironmentId: () => "env-1",
}));
vi.mock("~/t3team/chat/t3team-ThreadChatView", () => ({
  ThreadChatView: ({ threadId }: { threadId: string }) => <div>chat:{threadId}</div>,
}));

import { AppThreadPane } from "./t3team-AppThreadPane";

const PARENT_REF = scopeThreadRef(EnvironmentId.make("env-1"), ThreadId.make("parent-thread"));

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
        onCloseEmbeddedThread={() => {}}
      />,
    );

    expect(markup).not.toContain("t3team-embedded-thread-pane");
    expect(markup).not.toContain('aria-label="Close side-by-side thread"');
    expect(markup).toContain("chat:parent-thread");
  });

  it("adopts a legacy ?chatThreadId peer as a side-chat tab and strips the route param", () => {
    const closeSpy = vi.fn();
    const root = mountWithEffects(
      <AppThreadPane
        view={{
          type: "thread",
          projectId: "project-1",
          threadId: "parent-thread",
          embeddedThreadId: "child-thread",
        }}
        {...baseProps}
        onCloseEmbeddedThread={closeSpy}
      />,
    );
    act(() => root.unmount());

    const state = selectThreadRightPanelState(
      useRightPanelStore.getState().byThreadKey,
      PARENT_REF,
    );
    expect(state.surfaces).toEqual([
      {
        id: "thread:child-thread",
        kind: "thread",
        threadId: "child-thread",
        environmentId: "env-1",
      },
    ]);
    expect(state.activeSurfaceId).toBe("thread:child-thread");
    expect(state.isOpen).toBe(true);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it("ignores a legacy route where the peer is the thread itself", () => {
    const closeSpy = vi.fn();
    const root = mountWithEffects(
      <AppThreadPane
        view={{
          type: "thread",
          projectId: "project-1",
          threadId: "parent-thread",
          embeddedThreadId: "parent-thread",
        }}
        {...baseProps}
        onCloseEmbeddedThread={closeSpy}
      />,
    );
    act(() => root.unmount());

    expect(closeSpy).not.toHaveBeenCalled();
    expect(useRightPanelStore.getState().byThreadKey[scopedThreadKey(PARENT_REF)]).toBeUndefined();
  });
});
