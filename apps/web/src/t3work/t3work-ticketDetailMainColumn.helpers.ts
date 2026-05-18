import type { ProjectShellProject, ResourceSnapshot } from "@t3tools/project-context";
import type { MouseEvent } from "react";
import type { GitHubWorkActivityItem } from "~/t3work/t3work-githubActivity";
import type { ProjectTicket } from "~/t3work/t3work-types";
import type { BackendApi } from "~/t3work/backend/t3work-types";
import { buildTicketDetailContextBundle } from "~/t3work/t3work-ticketDetailContextBundle";
import type { TicketDetailContextTarget } from "~/t3work/t3work-ticketDetailContextBundle";

type SummaryItem = { label: string; value: string };

export function createSectionContextMenuHandler(input: {
  backend: BackendApi | undefined;
  ticket: ProjectTicket | undefined;
  projectId: string;
  project: ProjectShellProject;
  projectTickets: ReadonlyArray<ProjectTicket>;
  githubActivityItems: ReadonlyArray<GitHubWorkActivityItem>;
  snapshot: ResourceSnapshot | null;
  showAddToChatContextMenu: (
    event: MouseEvent,
    request: {
      projectId: string;
      projectTitle: string;
      projectWorkspaceRoot?: string | undefined;
      targetLabel: string;
      targetType: string;
      dedupeKey?: string;
      payload: unknown | (() => Promise<unknown>);
      summaryItems?: ReadonlyArray<SummaryItem>;
    },
  ) => Promise<void>;
}) {
  return (
    event: MouseEvent,
    target: TicketDetailContextTarget,
    targetLabel: string,
    summaryItems?: ReadonlyArray<SummaryItem>,
  ) => {
    if (!input.backend || !input.ticket) return;
    void input.showAddToChatContextMenu(event, {
      projectId: input.projectId,
      projectTitle: input.project.title,
      projectWorkspaceRoot: input.project.workspace?.rootPath,
      targetLabel,
      targetType: "Ticket Detail Item",
      dedupeKey: `${input.projectId}:${input.ticket.id}:${target}`,
      ...(summaryItems ? { summaryItems } : {}),
      payload: () =>
        buildTicketDetailContextBundle({
          backend: input.backend as BackendApi,
          project: input.project,
          ticket: input.ticket as ProjectTicket,
          projectTickets: input.projectTickets,
          githubActivityItems: input.githubActivityItems,
          target,
          targetLabel,
          ...(summaryItems ? { summaryItems } : {}),
          primarySnapshot: input.snapshot,
        }),
    });
  };
}

export function normalizeTicketAttachments(attachments: Array<Record<string, unknown>>) {
  return attachments.map((attachment) => ({
    id: typeof attachment.id === "string" ? attachment.id : undefined,
    filename: typeof attachment.filename === "string" ? attachment.filename : undefined,
    mimeType: typeof attachment.mimeType === "string" ? attachment.mimeType : undefined,
    content: typeof attachment.content === "string" ? attachment.content : undefined,
    thumbnail: typeof attachment.thumbnail === "string" ? attachment.thumbnail : undefined,
    size: typeof attachment.size === "number" ? attachment.size : undefined,
  }));
}

export function normalizeTicketComments(sortedComments: Array<Record<string, unknown>>) {
  return sortedComments.map((comment) => ({
    id: typeof comment.id === "string" ? comment.id : undefined,
    author: typeof comment.author === "string" ? comment.author : undefined,
    created: typeof comment.created === "string" ? comment.created : undefined,
    updated: typeof comment.updated === "string" ? comment.updated : undefined,
    bodyMarkdown: typeof comment.bodyMarkdown === "string" ? comment.bodyMarkdown : undefined,
    bodyHtml: typeof comment.bodyHtml === "string" ? comment.bodyHtml : undefined,
  }));
}
