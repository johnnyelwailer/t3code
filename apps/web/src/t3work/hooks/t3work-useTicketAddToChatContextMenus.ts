import type { MouseEvent } from "react";
import type { ProjectShellProject } from "@t3tools/project-context";

import { useBackend } from "~/t3work/backend/t3work-index";
import { useAddToChat } from "~/t3work/hooks/t3work-useAddToChat";
import type { AddToChatPayloadInput } from "~/t3work/t3work-addToChatUtils";
import { createGitHubActivityAddToChatRequest } from "~/t3work/t3work-githubActivityAttachmentRequest";
import { buildJiraWorkItemSummary } from "~/t3work/t3work-jiraContextMetadata";
import { buildTicketContextBundle } from "~/t3work/t3work-ticketContextBundle";
import type { GitHubWorkActivityItem } from "~/t3work/t3work-githubActivity";
import type { ProjectTicket } from "~/t3work/t3work-types";

export function useTicketAddToChatContextMenus(input: {
  project: ProjectShellProject;
  projectId: string;
  projectTickets: ReadonlyArray<ProjectTicket>;
  githubActivityByWorkItem: ReadonlyMap<string, ReadonlyArray<GitHubWorkActivityItem>>;
}) {
  const { project, projectId, projectTickets, githubActivityByWorkItem } = input;
  const backend = useBackend();
  const { showAddToChatContextMenu } = useAddToChat();

  const openTicketContextMenu = (event: MouseEvent, ticket: ProjectTicket) => {
    if (!backend) {
      return;
    }

    const githubItems = githubActivityByWorkItem.get(ticket.ref.displayId) ?? [];
    const jiraSummary = buildJiraWorkItemSummary(ticket);
    void showAddToChatContextMenu(event, {
      projectId,
      projectTitle: project.title,
      projectWorkspaceRoot: project.workspace?.rootPath,
      targetLabel: `${ticket.ref.displayId} ${ticket.ref.title}`,
      targetType: "work-item",
      kind: "jira-work-item",
      ...(jiraSummary.jiraIssueType ? { jiraIssueType: jiraSummary.jiraIssueType } : {}),
      ...(jiraSummary.jiraIssueTypeIconUrl
        ? { jiraIssueTypeIconUrl: jiraSummary.jiraIssueTypeIconUrl }
        : {}),
      summaryItems: jiraSummary.summaryItems,
      payload: (input?: AddToChatPayloadInput) =>
        buildTicketContextBundle({
          backend,
          project,
          ticket,
          projectTickets,
          githubActivityItems: githubItems,
          ...(input?.reportProgress ? { onProgress: input.reportProgress } : {}),
        }),
    });
  };

  const openGitHubActivityContextMenu = (
    event: MouseEvent,
    ticket: ProjectTicket,
    item: GitHubWorkActivityItem,
  ) => {
    const githubItems = githubActivityByWorkItem.get(ticket.ref.displayId) ?? [];
    void showAddToChatContextMenu(
      event,
      createGitHubActivityAddToChatRequest({
        backend,
        project,
        item,
        linkedWorkItem: ticket,
        projectTickets,
        githubActivityItems: githubItems,
      }),
    );
  };

  return {
    openTicketContextMenu,
    openGitHubActivityContextMenu,
  };
}
