import { describe, expect, it } from "vitest";

import {
  buildGitHubActivityAgentContextCapabilities,
  buildTicketAgentContextCapabilities,
} from "~/t3work/t3work-ticketAgentContext";
import type { GitHubWorkActivityItem } from "~/t3work/t3work-githubActivity";
import type { ProjectTicket } from "~/t3work/t3work-types";
import type { BackendApi } from "~/t3work/backend/t3work-types";
import type { ProjectShellProject } from "@t3tools/project-context";
import {
  buildTicketSidebarPinnedItem,
  buildTicketSidebarPinnedItemId,
} from "~/t3work/t3work-sidebarPinningTypes";

function createProject(): ProjectShellProject {
  return {
    id: "project-1",
    title: "Alpha",
    source: { provider: "atlassian", accountId: "acct-1" },
    workspace: { rootPath: "/workspace/alpha" },
  } as ProjectShellProject;
}

function createTicket(): ProjectTicket {
  return {
    id: "ticket-1",
    projectId: "project-1",
    description: "Capture release coordination details before kickoff.",
    ref: {
      provider: "atlassian",
      kind: "issue",
      id: "10009",
      displayId: "PROJ-9",
      title: "Prepare release checklist",
      type: "Story",
      url: "https://example.com/browse/PROJ-9",
      projectId: "10000",
    },
    issueType: "Story",
    status: "In Progress",
    assignee: "Alex",
    priority: "High",
    updatedAt: "2026-05-21T10:00:00.000Z",
  };
}

function createGitHubItem(): GitHubWorkActivityItem {
  return {
    id: "gh-1",
    provider: "github",
    reason: "authored",
    eventType: "pull_request",
    repository: "acme/alpha",
    repositoryUrl: "https://github.com/acme/alpha",
    subjectType: "PullRequest",
    subjectTitle: "Stabilize backlog context menus",
    subjectUrl: "https://github.com/acme/alpha/pull/42",
    updatedAt: "2026-05-22T10:00:00.000Z",
  } as GitHubWorkActivityItem;
}

describe("ticket agent context builders", () => {
  it("builds ticket capabilities around the shared add-to-chat action", () => {
    const capabilities = buildTicketAgentContextCapabilities({
      backend: {} as BackendApi,
      project: createProject(),
      ticket: createTicket(),
      projectTickets: [createTicket()],
      githubActivityItems: [],
    });
    const addToChatAction = capabilities.actions.find((action) => action.kind === "add-to-chat");

    expect(capabilities.actions).toHaveLength(1);
    expect(addToChatAction?.id).toBe("add-to-chat");
    expect(addToChatAction?.request.targetLabel).toBe("PROJ-9 Prepare release checklist");
    expect(addToChatAction?.request.kind).toBe("jira-work-item");
    expect(addToChatAction?.request.dedupeKey).toBe("project-1:PROJ-9:work-item");
  });

  it("builds GitHub activity capabilities with the same shared action shape", () => {
    const capabilities = buildGitHubActivityAgentContextCapabilities({
      backend: {} as BackendApi,
      project: createProject(),
      item: createGitHubItem(),
      linkedWorkItem: createTicket(),
      projectTickets: [createTicket()],
      githubActivityItems: [createGitHubItem()],
    });
    const addToChatAction = capabilities.actions.find((action) => action.kind === "add-to-chat");

    expect(capabilities.actions).toHaveLength(1);
    expect(addToChatAction?.id).toBe("add-to-chat");
    expect(addToChatAction?.request.targetLabel).toContain("Stabilize backlog context menus");
  });

  it("keeps visible Jira work items pinnable until they are explicitly pinned", () => {
    const ticket = createTicket();
    const capabilities = buildTicketAgentContextCapabilities(
      {
        backend: {} as BackendApi,
        project: createProject(),
        ticket,
        projectTickets: [ticket],
        githubActivityItems: [],
      },
      {
        sidebarPin: {
          item: buildTicketSidebarPinnedItem({ projectId: "project-1", ticketId: ticket.id }),
          pinned: false,
          visibleInSidebar: true,
        },
      },
    );

    expect(capabilities.actions).toEqual([
      expect.objectContaining({ id: "add-to-chat", kind: "add-to-chat" }),
      expect.objectContaining({ id: "pin-to-left", kind: "pin-to-sidebar" }),
    ]);
  });

  it("adds subtree cascade ids to pinned Jira unpin actions", () => {
    const ticket = createTicket();
    const child: ProjectTicket = {
      ...createTicket(),
      id: "ticket-2",
      parentId: ticket.id,
      ref: {
        ...createTicket().ref,
        id: "10010",
        displayId: "PROJ-10",
        title: "Prepare release subtask",
      },
      issueType: "Sub-task",
    };
    const capabilities = buildTicketAgentContextCapabilities(
      {
        backend: {} as BackendApi,
        project: createProject(),
        ticket,
        projectTickets: [ticket, child],
        githubActivityItems: [],
      },
      {
        sidebarPin: {
          item: buildTicketSidebarPinnedItem({ projectId: "project-1", ticketId: ticket.id }),
          pinned: true,
          cascadeItemIds: [
            buildTicketSidebarPinnedItemId({ projectId: "project-1", ticketId: ticket.id }),
            buildTicketSidebarPinnedItemId({ projectId: "project-1", ticketId: child.id }),
          ],
        },
      },
    );

    expect(capabilities.actions).toEqual([
      expect.objectContaining({ id: "add-to-chat", kind: "add-to-chat" }),
      expect.objectContaining({
        id: "unpin",
        kind: "unpin-from-sidebar",
        cascadeItemIds: [
          buildTicketSidebarPinnedItemId({ projectId: "project-1", ticketId: ticket.id }),
          buildTicketSidebarPinnedItemId({ projectId: "project-1", ticketId: child.id }),
        ],
      }),
    ]);
  });
});
