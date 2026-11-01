import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

const flags = vi.hoisted(() => ({ contextChatTab: false }));

vi.mock("~/t3team/t3team-contextChatTabFlag", () => ({
  useT3TeamContextChatTabEnabled: () => flags.contextChatTab,
}));

vi.mock("~/t3team/t3team-MyWorkContextChatTab", () => ({
  MyWorkContextChatTab: ({ fallback }: { fallback: React.ReactNode }) => (
    <div>
      context-chat-tab
      {fallback}
    </div>
  ),
}));

vi.mock("~/t3team/hooks/t3team-useProjectStore", () => ({
  useProjectStore: () => ({ allProjects: [] }),
}));

vi.mock("~/t3team/backend/t3team-index", () => ({
  useBackendState: () => ({ providers: [], connectionStatus: "connected" }),
}));

vi.mock("~/t3team/t3team-useScratchHomeChat", () => ({
  useT3TeamScratchHomeChat: () => ({
    scratchProject: { id: "scratch", name: "No project" },
    startScratch: undefined,
  }),
}));

vi.mock("~/t3team/t3team-AllProjectsMyWorkView", () => ({
  AllProjectsMyWorkView: () => <div>my-work-main</div>,
}));

vi.mock("~/t3team/t3team-AllProjectsKickoffAside", () => ({
  AllProjectsKickoffAside: () => <div>kickoff-aside</div>,
}));

vi.mock("~/t3team/t3team-DigestPrAside", () => ({
  DigestPrAside: ({ fallback }: { fallback: React.ReactNode }) => (
    <div>
      digest-pr-aside
      {fallback}
    </div>
  ),
}));

vi.mock("~/t3team/t3team-MyWorkRightPanel", () => ({
  MyWorkRightPanel: ({
    kickoff,
    chatTab,
  }: {
    kickoff: React.ReactNode;
    chatTab?: React.ReactNode;
  }) => (
    <div>
      my-work-right-panel
      {chatTab ?? kickoff}
    </div>
  ),
}));

vi.mock("~/t3team/t3team-myWorkRightPanelFlag", () => ({
  useT3TeamMyWorkRightPanelEnabled: () => true,
}));

vi.mock("~/t3team/t3team-digestPrAsideStore", () => ({
  closeDigestPullRequest: () => undefined,
  useDigestPrAsideStore: (selector: (state: { pullRequest: null; ticket: null }) => unknown) =>
    selector({ pullRequest: null, ticket: null }),
}));

vi.mock("~/rightPanelStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/rightPanelStore")>();
  return {
    ...actual,
    useRightPanelStore: (selector: (state: { byThreadKey: Record<string, never> }) => unknown) =>
      selector({ byThreadKey: {} }),
  };
});

vi.mock("~/t3team/t3team-ResizableRightSidebarLayout", () => ({
  ResizableRightSidebarLayout: ({
    main,
    aside,
  }: {
    main: React.ReactNode;
    aside: React.ReactNode;
  }) => (
    <div>
      {main}
      {aside}
    </div>
  ),
}));

const { AllProjectsMyWorkPane } = await import("./t3team-AllProjectsMyWorkPane");

const renderPane = () =>
  renderToStaticMarkup(
    <AllProjectsMyWorkPane
      onOpenTicket={() => undefined}
      getThreadsForProject={() => []}
      onRememberEmbeddedThread={() => undefined}
      onOpenThread={() => undefined}
      onOpenFullThread={() => undefined}
      onThreadKickoffConsumed={() => undefined}
      onKickoffProjectThread={() => "thread-1"}
    />,
  );

describe("AllProjectsMyWorkPane", () => {
  it("hands the panel a context chat tab only while CONTEXT_CHAT_TAB is on", () => {
    flags.contextChatTab = true;
    try {
      const markup = renderPane();
      expect(markup).toContain("context-chat-tab");
      expect(markup).toContain("kickoff-aside");
    } finally {
      flags.contextChatTab = false;
    }
    expect(renderPane()).not.toContain("context-chat-tab");
  });

  it("hosts the kickoff aside by default, not a PR-only empty state", () => {
    const markup = renderPane();
    expect(markup).toContain("kickoff-aside");
    expect(markup).toContain("my-work-right-panel");
    expect(markup).not.toContain("Open a pull request or a work item");
  });
});
