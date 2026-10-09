import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

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

vi.mock("~/t3team/t3team-digestPrAsideStore", () => ({
  closeDigestPullRequest: () => undefined,
  useDigestPrAsideStore: (selector: (state: { pullRequest: null; ticket: null }) => unknown) =>
    selector({ pullRequest: null, ticket: null }),
}));

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

describe("AllProjectsMyWorkPane", () => {
  it("hosts the kickoff aside by default, not a PR-only empty state", () => {
    const markup = renderToStaticMarkup(
      <AllProjectsMyWorkPane
        onOpenTicket={() => undefined}
        getThreadsForProject={() => []}
        onRememberEmbeddedThread={() => undefined}
        onOpenThread={() => undefined}
        onOpenFullThread={() => undefined}
        onThreadKickoffConsumed={() => undefined}
        onKickoffProjectThread={() => undefined}
      />,
    );
    expect(markup).toContain("kickoff-aside");
    expect(markup).not.toContain("Open a pull request or a work item");
  });
});
