// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

const entityState: {
  thread: { id: string; projectId: string; title: string } | null;
  project: { title: string; source?: { provider?: string }; workspaceRoot?: string } | null;
} = { thread: null, project: null };

vi.mock("~/state/entities", () => ({
  useThread: () => entityState.thread,
  useProject: () => entityState.project,
}));

vi.mock("~/t3team/chat/t3team-ThreadChatView", () => ({
  ThreadChatView: (props: Record<string, unknown>) => (
    <div
      data-testid="thread-chat-view"
      data-props={JSON.stringify({
        threadId: props.threadId,
        projectId: props.projectId,
        projectTitle: props.projectTitle,
        projectSource: props.projectSource ?? null,
        projectWorkspaceRoot: props.projectWorkspaceRoot ?? null,
        title: props.title,
        hideHeader: props.hideHeader,
        embeddedMode: props.embeddedMode,
      })}
    />
  ),
}));

import { T3TeamThreadRightPanelSurface } from "./t3team-ThreadRightPanelSurface";

function renderSurface() {
  return renderToStaticMarkup(
    <T3TeamThreadRightPanelSurface environmentId="env-1" threadId="thread-C" />,
  );
}

function readStubProps(markup: string): Record<string, unknown> {
  const match = markup.match(/data-props="([^"]+)"/);
  expect(match).not.toBeNull();
  const raw = match?.[1];
  expect(raw).toBeDefined();
  return JSON.parse(raw!.replace(/&quot;/g, '"'));
}

describe("T3TeamThreadRightPanelSurface", () => {
  it("shows a loading state until the peer thread's detail is fetched", () => {
    const html = renderSurface();

    expect(html).toContain("Loading thread…");
    expect(html).not.toContain('data-testid="thread-chat-view"');
  });

  it("renders the peer thread embedded: header hidden, embedded mode on", () => {
    entityState.thread = { id: "thread-C", projectId: "project-1", title: "Accessibility review" };
    const html = renderSurface();
    entityState.thread = null;

    expect(html).toContain('data-testid="thread-chat-view"');
    expect(readStubProps(html)).toEqual({
      threadId: "thread-C",
      projectId: "project-1",
      projectTitle: "project-1",
      projectSource: null,
      projectWorkspaceRoot: null,
      title: "Accessibility review",
      hideHeader: true,
      embeddedMode: true,
    });
  });

  it("renders an ephemeral thread that never gets a shell projection (workflow child threads)", () => {
    // Workflow child threads created by the orchestration engine's agent(...) primitive are
    // `retention: "ephemeral"` on purpose so they stay out of the sidebar, which means the
    // shell snapshot never carries them — only the independent detail fetch resolves. This is
    // the regression case: the surface must render from detail alone, with no shell at all.
    entityState.thread = { id: "thread-C", projectId: "project-1", title: "Review correctness" };
    const html = renderSurface();
    entityState.thread = null;

    expect(html).toContain('data-testid="thread-chat-view"');
    expect(html).not.toContain("Loading thread…");
  });

  it("passes the project title, source and workspace root through when the project is projected", () => {
    entityState.thread = { id: "thread-C", projectId: "project-1", title: "Accessibility review" };
    entityState.project = {
      title: "Nexplore AI",
      source: { provider: "local" },
      workspaceRoot: "/tmp/wt",
    };
    const html = renderSurface();
    entityState.thread = null;
    entityState.project = null;

    expect(readStubProps(html)).toEqual({
      threadId: "thread-C",
      projectId: "project-1",
      projectTitle: "Nexplore AI",
      projectSource: { provider: "local" },
      projectWorkspaceRoot: "/tmp/wt",
      title: "Accessibility review",
      hideHeader: true,
      embeddedMode: true,
    });
  });
});
