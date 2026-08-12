import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import type { ProjectThread } from "./t3team-types";
import { EmbeddedThreadAside } from "./t3team-EmbeddedThreadAside";

vi.mock("~/t3team/chat/t3team-ThreadChatView", () => ({
  ThreadChatView: () => <div>thread-view</div>,
}));

describe("EmbeddedThreadAside", () => {
  it("puts the full-thread action in a compact panel header", () => {
    const markup = renderToStaticMarkup(
      <EmbeddedThreadAside
        thread={{ id: "thread-1", title: "Thread" } as ProjectThread}
        projectId="project-1"
        projectTitle="Project"
        onThreadKickoffConsumed={() => {}}
        onOpenFullThread={() => {}}
      />,
    );

    expect(markup).toContain('aria-label="Open full thread"');
    expect(markup).toContain("flex h-10 shrink-0 items-center justify-end");
    expect(markup).not.toContain("flex min-h-0 flex-1 flex-col pt-10");
  });
});
