import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { AppThreadPane } from "./t3work-AppThreadPane";

vi.mock("@tanstack/react-router", () => ({ useCanGoBack: () => false }));
vi.mock("~/t3work/chat/t3work-ThreadChatView", () => ({
  ThreadChatView: ({ threadId }: { threadId: string }) => <div>chat:{threadId}</div>,
}));

describe("AppThreadPane", () => {
  it("renders an accessible close control for the secondary chat pane", () => {
    const markup = renderToStaticMarkup(
      <AppThreadPane
        view={{ type: "thread", projectId: "project-1", threadId: "parent-thread" }}
        threadProject={null}
        resolvedThread={null}
        embeddedThread={null}
        onOpenTicket={() => {}}
        onOpenEmbeddedThread={() => {}}
        onCloseEmbeddedThread={() => {}}
        onThreadKickoffConsumed={() => {}}
        onRememberFullThread={() => {}}
        onBackToDashboard={() => {}}
      />,
    );

    expect(markup).not.toContain('aria-label="Close side-by-side thread"');

    const splitMarkup = renderToStaticMarkup(
      <AppThreadPane
        view={{
          type: "thread",
          projectId: "project-1",
          threadId: "parent-thread",
          embeddedThreadId: "child-thread",
        }}
        threadProject={null}
        resolvedThread={null}
        embeddedThread={null}
        onOpenTicket={() => {}}
        onOpenEmbeddedThread={() => {}}
        onCloseEmbeddedThread={() => {}}
        onThreadKickoffConsumed={() => {}}
        onRememberFullThread={() => {}}
        onBackToDashboard={() => {}}
      />,
    );

    expect(splitMarkup).toContain('aria-label="Close side-by-side thread"');
    expect(splitMarkup).toContain('title="Close side-by-side thread"');
    expect(splitMarkup).toContain("lucide-x");
  });
});
