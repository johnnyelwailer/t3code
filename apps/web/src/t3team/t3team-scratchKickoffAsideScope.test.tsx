// @vitest-environment jsdom
/**
 * The regression this file exists for: once the environment's Scratch project exists, the home
 * and all-projects My Work asides mount `ProjectDashboardKickoffAside`, which runs dashboard recipe
 * actions. Neither host mounted `T3TeamDashboardRecipeActionProvider` (only a project dashboard
 * did), so the route threw "Dashboard recipe actions must be used inside
 * T3TeamDashboardRecipeActionProvider." The first visit looked fine because Scratch did not exist
 * yet (the aside offered to create it); every visit after that crashed.
 *
 * The kickoff aside is pinned to a minimal consumer of the REAL recipe-action hook, so these
 * tests fail exactly when a host forgets the provider.
 */
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import { renderToStaticMarkup } from "react-dom/server";

import { useRunT3TeamDashboardRecipeAction } from "~/t3team/t3team-dashboardRecipeActions";

const scratchProject = { id: "scratch-1", title: "No project", workspace: { rootPath: "/s" } };

vi.mock("~/t3team/t3team-ProjectDashboardKickoffAside", () => ({
  ProjectDashboardKickoffAside: ({ project }: { project: { title: string } }) => {
    useRunT3TeamDashboardRecipeAction();
    return <span>kickoff for {project.title}</span>;
  },
}));
vi.mock("~/t3team/t3team-ResizableRightSidebarLayout", () => ({
  ResizableRightSidebarLayout: ({ main, aside }: { main: ReactNode; aside: ReactNode }) => (
    <div>
      {main}
      {aside}
    </div>
  ),
}));
vi.mock("~/t3team/t3team-AllProjectsMyWorkView", () => ({ AllProjectsMyWorkView: () => null }));
vi.mock("~/t3team/hooks/t3team-useProjectStore", () => ({
  useProjectStore: () => ({ allProjects: [scratchProject] }),
}));
vi.mock("~/t3team/t3team-useScratchHomeChat", () => ({
  useT3TeamScratchHomeChat: () => ({ scratchProject, startScratch: undefined }),
}));
vi.mock("~/t3team/backend/t3team-index", () => ({
  useBackendState: () => ({ providers: [], connectionStatus: "connected" }),
}));
vi.mock("~/t3team/t3team-myWorkRightPanelFlag", () => ({
  useT3TeamMyWorkRightPanelEnabled: () => false,
}));

const { AllProjectsMyWorkPane } = await import("~/t3team/t3team-AllProjectsMyWorkPane");
const { ProjectBrowserEmptyWithChat } = await import("~/t3team/t3team-AppMainContentShell");

describe("kickoff aside on the Scratch project", () => {
  it("renders on the all-projects My Work page once Scratch exists", () => {
    const markup = renderToStaticMarkup(
      <AllProjectsMyWorkPane
        onOpenTicket={() => {}}
        getThreadsForProject={() => []}
        onRememberEmbeddedThread={() => {}}
        onOpenThread={() => {}}
        onOpenFullThread={() => {}}
        onThreadKickoffConsumed={() => {}}
        onKickoffProjectThread={() => "thread-1"}
      />,
    );
    expect(markup).toContain("kickoff for No project");
  });

  it("renders on the home empty state once Scratch exists", () => {
    const markup = renderToStaticMarkup(
      <ProjectBrowserEmptyWithChat
        onCreate={() => {}}
        project={scratchProject as never}
        providers={[]}
        isConnected
        onOpenThread={() => {}}
        onKickoffProjectThread={() => "thread-1"}
      />,
    );
    expect(markup).toContain("kickoff for No project");
  });
});
