// @vitest-environment jsdom
import { describe, expect, it, vi } from "vite-plus/test";
import { renderToStaticMarkup } from "react-dom/server";
import type * as React from "react";
import type { ProjectShellProject } from "@t3tools/project-context";

import type { GitHubWorkActivityItem } from "~/t3team/t3team-githubActivity";
import { createProjectBacklogTestTicket } from "~/t3team/t3team-projectBacklogTestUtils";

vi.mock("~/t3team/hooks/t3team-useTicketAgentContext", () => ({
  useTicketAgentContext: () => ({
    getTicketAgentContext: () => null,
    openTicketAgentContextMenu: () => {},
  }),
}));

const { ProjectMyWorkContent } = await import("~/t3team/t3team-ProjectMyWorkContent");
const { ProjectMyWorkPrChips, readPullRequestNumber, selectOpenPullRequests } =
  await import("~/t3team/t3team-ProjectMyWorkPrChips");
const { buildProjectMyWorkVisibleHierarchy } = await import("~/t3team/t3team-projectMyWork");
const { buildProjectTicketKanbanColumns } = await import("~/t3team/t3team-projectTicketStatus");
const { buildProjectTicketHierarchy } = await import("~/t3team/t3team-ticketHierarchy");

function pr(
  number: number,
  state: GitHubWorkActivityItem["subjectState"],
  title: string,
  workItemKey = "NEX-2",
): GitHubWorkActivityItem {
  return {
    id: `github.com:acme/app#${number}`,
    repository: "acme/app",
    reason: "subscribed",
    subjectType: "PullRequest",
    subjectTitle: title,
    subjectUrl: `https://github.com/acme/app/pull/${number}`,
    ...(state ? { subjectState: state } : {}),
    workItemKey,
  };
}

const PROJECT = {
  id: "project-1",
  title: "Nexplore Platform",
  source: { provider: "atlassian", accountId: "acct-1", externalProjectId: "ext-1", raw: {} },
} as unknown as ProjectShellProject;

type ContentProps = React.ComponentProps<typeof ProjectMyWorkContent>;

// NEX-2 is a child of NEX-1, so the hierarchy lens renders it at depth 1 (compact).
function contentProps(lens: "hierarchy" | "board", viewMode: ContentProps["viewMode"] = "list") {
  const tickets = [
    createProjectBacklogTestTicket({
      id: "epic-1",
      status: "In Progress",
      assignee: "Philip",
      ref: { displayId: "NEX-1", title: "Parent epic" },
    }),
    createProjectBacklogTestTicket({
      id: "sub-2",
      status: "In Analysis",
      assignee: "Philip",
      parentId: "epic-1",
      ref: { displayId: "NEX-2", title: "Child story" },
    }),
  ];
  const visibleHierarchy = buildProjectMyWorkVisibleHierarchy(tickets, tickets, {
    sortBy: "updated",
    sortDirection: "asc",
  });
  return {
    loading: false,
    project: PROJECT,
    tickets,
    assignedWorkItems: tickets,
    filteredWorkItems: tickets,
    visibleHierarchy,
    lens,
    viewMode,
    groupMode: "flat",
    tableSortBy: "updated",
    tableSortDirection: "asc",
    kanbanColumns: buildProjectTicketKanbanColumns(tickets),
    parentChildGroups: buildProjectTicketHierarchy(tickets),
    githubActivityByWorkItem: new Map([
      ["NEX-2", [pr(41, "open", "Wire the child story"), pr(40, "merged", "Old merged work")]],
    ]),
    onTableSortByChange: () => {},
    onTableSortDirectionChange: () => {},
    onOpenTicket: () => {},
  } satisfies ContentProps;
}

describe("ProjectMyWorkPrChips", () => {
  it("keeps only open and draft PRs and reads their number", () => {
    const items = [
      pr(1, "open", "a"),
      pr(2, "draft", "b"),
      pr(3, "merged", "c"),
      pr(4, "closed", "d"),
    ];
    expect(selectOpenPullRequests(items).map(readPullRequestNumber)).toEqual(["1", "2"]);
  });

  it("shows two chips with number, state and title, then a +N overflow", () => {
    const markup = renderToStaticMarkup(
      <ProjectMyWorkPrChips
        items={[pr(7, "open", "First"), pr(8, "draft", "Second"), pr(9, "open", "Third")]}
      />,
    );
    expect(markup).toContain("#7");
    expect(markup).toContain("First");
    expect(markup).toContain("#8");
    expect(markup).toContain("draft");
    expect(markup).not.toContain("Third");
    expect(markup).toContain("+1");
    expect(markup).toContain('href="https://github.com/acme/app/pull/7"');
  });

  it("renders nothing without an open PR", () => {
    expect(renderToStaticMarkup(<ProjectMyWorkPrChips items={[pr(3, "merged", "c")]} />)).toBe("");
  });
});

describe("related PR chips on the non-digest lenses", () => {
  it.each([
    ["list (hierarchy lens, nested child row)", contentProps("hierarchy", "list")],
    ["kanban (board lens, compact card)", contentProps("board")],
    ["hierarchy grid (nested compact card)", contentProps("hierarchy", "grid")],
  ])("renders the open PR on %s", (_label, props) => {
    const markup = renderToStaticMarkup(<ProjectMyWorkContent {...props} />);
    expect(markup).toContain('data-testid="my-work-pr-chips"');
    expect(markup).toContain("#41");
    expect(markup).toContain("Wire the child story");
    expect(markup).not.toContain("Old merged work");
  });

  it("renders the hierarchy tree, not the board, when the lens is hierarchy and viewMode kanban", () => {
    const markup = renderToStaticMarkup(
      <ProjectMyWorkContent {...contentProps("hierarchy", "kanban")} />,
    );
    expect(markup).toContain("border-l-2 border-border/60 pl-3");
    expect(markup).not.toContain("overflow-x-auto");
  });
});

describe("PR chip click", () => {
  it("does not bubble to the row/card that opens the ticket", async () => {
    const { createRoot } = await import("react-dom/client");
    const { act } = await import("react");
    const container = document.createElement("div");
    const onRowClick = vi.fn();
    document.body.append(container);
    const root = createRoot(container);
    await act(async () =>
      root.render(
        <div onClick={onRowClick}>
          <ProjectMyWorkPrChips items={[pr(5, "open", "x")]} />
        </div>,
      ),
    );
    const link = container.querySelector("a");
    link?.addEventListener("click", (event) => event.preventDefault());
    await act(async () => link?.click());
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(onRowClick).not.toHaveBeenCalled();
    act(() => root.unmount());
    container.remove();
  });
});
