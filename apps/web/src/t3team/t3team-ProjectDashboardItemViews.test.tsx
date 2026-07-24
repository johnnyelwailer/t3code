import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import type { GitHubWorkActivityItem } from "~/t3team/t3team-githubActivity";

import { TicketWorkItemCard } from "./t3team-ProjectDashboardItemViews";
import { createProjectBacklogTestTicket as createTicket } from "./t3team-projectBacklogTestUtils";

vi.mock("~/t3team/components/ticket/t3team-JiraIssueType", () => ({
  JiraIssueTypeIcon: () => <span>jira-icon</span>,
}));

vi.mock("./t3team-ProjectDashboardItemViewParts", () => ({
  ProjectDashboardTicketTooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  ProjectDashboardTicketRelationshipBadge: () => null,
}));

function createGitHubItem(): GitHubWorkActivityItem {
  return {
    id: "github-item-1",
    repository: "t3tools/t3code",
    reason: "review_requested",
    updatedAt: "2026-05-27T12:00:00.000Z",
    subjectUrl: "https://github.com/t3tools/t3code/pull/42",
    subjectType: "PullRequest",
    subjectTitle: "IES-9242 Add linked PR visibility",
    subjectState: "open",
  };
}

describe("TicketWorkItemCard", () => {
  const badgeLabel = 'aria-label="PR open: IES-9242 Add linked PR visibility"';

  it("hides the GitHub title badge when explicitly suppressed for kanban cards", () => {
    const ticket = createTicket({
      id: "ies-9242",
      ref: { displayId: "IES-9242", title: "Add linked PR visibility" },
    });

    const markup = renderToStaticMarkup(
      <TicketWorkItemCard
        ticket={ticket}
        compact
        githubActivityItems={[createGitHubItem()]}
        showGitHubActivityTitleBadge={false}
        onOpen={() => {}}
      />,
    );

    expect(markup).not.toContain(badgeLabel);
  });

  it("keeps the GitHub title badge by default outside kanban suppression", () => {
    const ticket = createTicket({
      id: "ies-9242",
      ref: { displayId: "IES-9242", title: "Add linked PR visibility" },
    });

    const markup = renderToStaticMarkup(
      <TicketWorkItemCard
        ticket={ticket}
        compact
        githubActivityItems={[createGitHubItem()]}
        onOpen={() => {}}
      />,
    );

    expect(markup).toContain(badgeLabel);
  });
});
