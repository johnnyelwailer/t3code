import type { MouseEvent } from "react";
import type { ProjectShellProject } from "@t3tools/project-context";

import { useBackend } from "~/t3work/backend/t3work-index";
import { useAddToChat } from "~/t3work/hooks/t3work-useAddToChat";
import { buildComprehensiveTicketPayload } from "~/t3work/t3work-addToChatPayloadBuilders";
import {
  buildGitHubActivityContextBundle,
  buildGitHubActivityDisplay,
} from "~/t3work/t3work-githubActivityContextPayload";
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
    void showAddToChatContextMenu(event, {
      projectId,
      projectTitle: project.title,
      projectWorkspaceRoot: project.workspace?.rootPath,
      targetLabel: `${ticket.ref.displayId} ${ticket.ref.title}`,
      targetType: "work-item",
      summaryItems: [
        { label: "Status", value: ticket.status },
        ...(ticket.priority ? [{ label: "Priority", value: ticket.priority }] : []),
        ...(ticket.assignee ? [{ label: "Assignee", value: ticket.assignee }] : []),
      ],
      payload: () =>
        buildComprehensiveTicketPayload({
          backend,
          project,
          ticket,
          projectTickets,
          githubActivityItems: githubItems,
        }),
    });
  };

  const openGitHubActivityContextMenu = (
    event: MouseEvent,
    ticket: ProjectTicket,
    item: GitHubWorkActivityItem,
  ) => {
    const display = buildGitHubActivityDisplay({ item });
    const githubItems = githubActivityByWorkItem.get(ticket.ref.displayId) ?? [];
    void showAddToChatContextMenu(event, {
      projectId,
      projectTitle: project.title,
      projectWorkspaceRoot: project.workspace?.rootPath,
      targetLabel: display.targetLabel,
      targetType: display.targetType,
      dedupeKey: `${projectId}:github-activity:${item.id}`,
      summaryItems: display.summaryItems,
      payload: async () => {
        const linkedTicketContext = backend
          ? await buildComprehensiveTicketPayload({
              backend,
              project,
              ticket,
              projectTickets,
              githubActivityItems: githubItems,
            })
          : undefined;
        return buildGitHubActivityContextBundle({
          project,
          item,
          linkedWorkItem: ticket,
          ...(linkedTicketContext ? { linkedTicketContext } : {}),
        });
      },
    });
  };

  return {
    openTicketContextMenu,
    openGitHubActivityContextMenu,
  };
}
