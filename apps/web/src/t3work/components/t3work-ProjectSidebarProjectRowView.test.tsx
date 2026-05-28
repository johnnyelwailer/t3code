import { renderToStaticMarkup } from "react-dom/server";
import type { ProjectShellProject } from "@t3tools/project-context";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectSidebarProjectRowView } from "./t3work-ProjectSidebarProjectRowView";
import type { ProjectRowProps } from "./t3work-projectSidebarProjectRowTypes";

vi.mock("./t3work-ProjectSidebarProjectHeader", () => ({
  ProjectSidebarProjectHeader: () => <div>project-header</div>,
}));

vi.mock("./t3work-ProjectSidebarCurrentIssuesContent", () => ({
  ProjectSidebarCurrentIssuesContent: () => <div>current-issues</div>,
}));

vi.mock("./t3work-ProjectSidebarDashboardThreadList", () => ({
  ProjectSidebarDashboardThreadList: () => <div>thread-list</div>,
}));

vi.mock("./t3work-ProjectSidebarPinnedItems", () => ({
  ProjectSidebarPinnedItems: ({ items }: { items: ReadonlyArray<{ kind: string }> }) => (
    <div>pinned-items:{items.map((item) => item.kind).join(",")}</div>
  ),
}));

vi.mock("./t3work-ProjectSidebarDashboardNav", () => ({
  ProjectSidebarDashboardNav: ({
    pinnedItemCount,
    pinnedContent,
    currentIssueCount,
    currentIssuesContent,
    githubItems,
  }: {
    pinnedItemCount: number;
    pinnedContent?: React.ReactNode;
    currentIssueCount: number;
    currentIssuesContent: React.ReactNode;
    githubItems: ReadonlyArray<unknown>;
  }) => (
    <div>
      <div>nav:pinned-count:{pinnedItemCount}</div>
      <div>nav:issues-count:{currentIssueCount}</div>
      <div>nav:github-count:{githubItems.length}</div>
      {pinnedContent}
      {currentIssueCount > 0 ? currentIssuesContent : null}
    </div>
  ),
}));

vi.mock("./t3work-useProjectSidebarProjectRow", () => ({
  useProjectSidebarProjectRow: () => ({
    myWorkExpanded: true,
    setMyWorkExpanded: () => {},
    myWorkThreads: [],
    backlogThreads: [],
    ticketThreadsById: new Map(),
    githubActivityByWorkItem: new Map(),
    unlinkedGitHubActivityItems: [],
    githubActivityLastCheckedAt: undefined,
    visibleThreads: [],
    hasOverflowingThreads: false,
    expandedThreadList: false,
    setExpandedThreadList: () => {},
    isRenaming: false,
    renameInputRef: { current: null },
    renameTitle: "",
    setRenameTitle: () => {},
    handleProjectClick: () => {},
    handleContextMenu: () => {},
    handleToggleExpand: () => {},
    handleRenameKeyDown: () => {},
    handleRenameSubmit: () => {},
    handleNewThread: () => {},
    handleOpenMenu: () => {},
  }),
}));

function createPinnedState(overrides: Record<string, unknown> = {}) {
  return {
    pinnedItems: [
      {
        kind: "jira-work-item",
        pinnedItem: {
          id: "pin:project-1:ticket-1",
          kind: "jira-work-item",
          projectId: "project-1",
          ticketId: "ticket-1",
          pinnedAt: "2026-05-27T12:00:00.000Z",
        },
        ticket: {
          id: "ticket-1",
          projectId: "project-1",
          ref: {
            provider: "jira",
            kind: "issue",
            id: "10001",
            displayId: "PROJ-1",
            title: "Restore pinned nav item",
            url: "https://example.test/PROJ-1",
            projectId: "project-1",
          },
          status: "In Progress",
          updatedAt: "2026-05-27T12:00:00.000Z",
        },
        ticketThreads: [],
      },
    ],
    showPinnedOnlyFeed: false,
    effectiveProjectTickets: [],
    effectiveTicketHierarchy: {
      roots: [],
      unresolvedChildren: [],
      childrenByParentId: new Map(),
    },
    effectiveVisibleFlatTickets: [],
    effectiveGitHubActivityByWorkItem: new Map(),
    effectiveUnlinkedGitHubItems: [],
    effectiveVisibleTicketIds: new Set(["ticket-1"]),
    effectiveHiddenTicketCount: 0,
    ...overrides,
  };
}

const mockUseProjectSidebarProjectRowPinnedState = vi.fn(() => createPinnedState());

vi.mock("./t3work-useProjectSidebarProjectRowPinnedState", () => ({
  useProjectSidebarProjectRowPinnedState: () => mockUseProjectSidebarProjectRowPinnedState(),
}));

const projectId = "project-1";

function createProps(overrides: Partial<ProjectRowProps> = {}): ProjectRowProps {
  const project: ProjectShellProject = {
    id: projectId as ProjectShellProject["id"],
    title: "Inbox Export Service",
    source: {
      provider: "local",
      externalProjectId: projectId,
      raw: {},
    },
    workspace: {
      rootPath: "/tmp/project-1",
      createdAt: "2026-05-27T09:00:00.000Z",
    },
    createdAt: "2026-05-27T09:00:00.000Z",
    updatedAt: "2026-05-27T09:00:00.000Z",
  };

  return {
    project,
    projectThreads: [],
    projectTickets: [],
    expanded: true,
    projectStatus: null,
    view: null,
    activeDashboardMode: "my-work",
    threadSortOrder: "recent_activity" as ProjectRowProps["threadSortOrder"],
    threadPreviewCount: 3,
    ticketViewMode: "tree",
    showProjectThreads: false,
    showMyActivityFeed: false,
    showJiraItems: true,
    showGitHubActivity: false,
    onSelectProject: () => {},
    onSelectProjectDashboardMode: () => {},
    onToggleExpand: () => {},
    onSelectThread: () => {},
    onSelectTicket: () => {},
    onManageProjectRepositories: () => {},
    onDeleteProject: () => {},
    onRenameProject: () => {},
    onCreateThread: () => "thread-1",
    onCreateTicketThread: () => "thread-1",
    onDeleteThread: () => {},
    onRenameThread: () => {},
    ...overrides,
  };
}

describe("ProjectSidebarProjectRowView", () => {
  beforeEach(() => {
    mockUseProjectSidebarProjectRowPinnedState.mockReturnValue(createPinnedState());
  });

  it("passes resolved pinned items through to the dashboard nav", () => {
    const markup = renderToStaticMarkup(<ProjectSidebarProjectRowView {...createProps()} />);

    expect(markup).toContain("nav:pinned-count:1");
    expect(markup).toContain("pinned-items:jira-work-item");
  });

  it("renders the filtered issue hierarchy without a duplicate pinned Jira row in tree view", () => {
    mockUseProjectSidebarProjectRowPinnedState.mockReturnValue(
      createPinnedState({
        showPinnedOnlyFeed: true,
        effectiveProjectTickets: [
          {
            id: "ticket-1",
            projectId,
            ref: {
              provider: "jira",
              kind: "issue",
              id: "10001",
              displayId: "PROJ-1",
              title: "Restore pinned nav item",
              url: "https://example.test/PROJ-1",
              projectId,
            },
            status: "In Progress",
            updatedAt: "2026-05-27T12:00:00.000Z",
          },
        ],
        effectiveUnlinkedGitHubItems: [{ id: "gh-1" }],
      }),
    );

    const markup = renderToStaticMarkup(<ProjectSidebarProjectRowView {...createProps()} />);

    expect(markup).toContain("nav:pinned-count:0");
    expect(markup).toContain("nav:issues-count:1");
    expect(markup).toContain("nav:github-count:1");
    expect(markup).toContain("current-issues");
    expect(markup).not.toContain("pinned-items:");
  });

  it("does not render a duplicate current-issues section when my work falls back to pins in flat view", () => {
    mockUseProjectSidebarProjectRowPinnedState.mockReturnValue(
      createPinnedState({
        showPinnedOnlyFeed: true,
        effectiveProjectTickets: [
          {
            id: "ticket-1",
            projectId,
            ref: {
              provider: "jira",
              kind: "issue",
              id: "10001",
              displayId: "PROJ-1",
              title: "Restore pinned nav item",
              url: "https://example.test/PROJ-1",
              projectId,
            },
            status: "In Progress",
            updatedAt: "2026-05-27T12:00:00.000Z",
          },
        ],
        effectiveUnlinkedGitHubItems: [{ id: "gh-1" }],
      }),
    );

    const markup = renderToStaticMarkup(
      <ProjectSidebarProjectRowView {...createProps({ ticketViewMode: "flat" })} />,
    );

    expect(markup).toContain("pinned-items");
    expect(markup).toContain("nav:issues-count:0");
    expect(markup).toContain("nav:github-count:0");
    expect(markup).not.toContain("current-issues");
  });
});
