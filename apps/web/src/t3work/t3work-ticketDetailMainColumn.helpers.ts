import type { ProjectShellProject, ResourceSnapshot } from "@t3tools/project-context";
import type { MouseEvent } from "react";
import type { GitHubWorkActivityItem } from "~/t3work/t3work-githubActivity";
import type { ProjectTicket } from "~/t3work/t3work-types";
import type { AddToChatPayloadInput } from "~/t3work/t3work-addToChatUtils";
import {
  buildAddToChatAgentContextCapabilities,
  type AgentContextCapabilities,
} from "~/t3work/t3work-agentContext";
import type { BackendApi } from "~/t3work/backend/t3work-types";
import { refreshTicketDetailContextBundle } from "~/t3work/t3work-refreshTicketDetailContextBundle";
import type { TicketDetailContextTarget } from "~/t3work/t3work-ticketDetailContextBundle";
import { normalizeTicketAttachments } from "~/t3work/t3work-ticketAttachmentUtils";
import {
  toRelationshipTicket,
  type RelationshipEntry,
} from "~/t3work/t3work-ticketRelationships-helpers";

type SummaryItem = { label: string; value: string };

export { normalizeTicketAttachments };

export function createSectionContextMenuHandler(input: {
  backend: BackendApi | undefined;
  ticket: ProjectTicket | undefined;
  projectId: string;
  project: ProjectShellProject;
  projectTickets: ReadonlyArray<ProjectTicket>;
  githubActivityItems: ReadonlyArray<GitHubWorkActivityItem>;
  snapshot: ResourceSnapshot | null;
  showAgentContextMenu: (
    event: MouseEvent,
    capabilities: AgentContextCapabilities,
  ) => Promise<boolean>;
}) {
  return (
    event: MouseEvent,
    target: TicketDetailContextTarget,
    targetLabel: string,
    summaryItems?: ReadonlyArray<SummaryItem>,
    options?: {
      kind?: string;
      dedupeKey?: string;
      jiraIssueType?: string;
      jiraIssueTypeIconUrl?: string;
    },
  ) => {
    if (!input.backend || !input.ticket) return;
    const resolvedKind = options?.kind ?? `jira-ticket-${target}`;
    const resolvedDedupeKey =
      options?.dedupeKey ?? `${input.projectId}:${input.ticket.id}:${target}`;
    void input.showAgentContextMenu(
      event,
      buildAddToChatAgentContextCapabilities({
        projectId: input.projectId,
        projectTitle: input.project.title,
        projectWorkspaceRoot: input.project.workspace?.rootPath,
        targetLabel,
        targetType: "Ticket Detail Item",
        kind: resolvedKind,
        ...(options?.jiraIssueType ? { jiraIssueType: options.jiraIssueType } : {}),
        ...(options?.jiraIssueTypeIconUrl
          ? { jiraIssueTypeIconUrl: options.jiraIssueTypeIconUrl }
          : {}),
        dedupeKey: resolvedDedupeKey,
        ...(summaryItems ? { summaryItems } : {}),
        payload: (progress?: AddToChatPayloadInput) =>
          refreshTicketDetailContextBundle({
            backend: input.backend as BackendApi,
            project: input.project,
            ticket: input.ticket as ProjectTicket,
            target,
            targetLabel,
            ...(summaryItems ? { summaryItems } : {}),
            ...(progress?.reportProgress ? { onProgress: progress.reportProgress } : {}),
          }),
      }),
    );
  };
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

export function buildParentContextMenuData(input: {
  displayId: string;
  parentEntry: RelationshipEntry | undefined;
}) {
  const parentTicket = input.parentEntry?.ticket;
  const label = parentTicket
    ? `${parentTicket.ref.displayId} ${parentTicket.ref.title}`
    : input.parentEntry
      ? input.parentEntry.key
      : `${input.displayId} parent`;
  const summaryItems = parentTicket
    ? [
        { label: "Issue type", value: parentTicket.issueType ?? parentTicket.ref.type ?? "Issue" },
        { label: "Status", value: parentTicket.status },
        ...(parentTicket.priority ? [{ label: "Priority", value: parentTicket.priority }] : []),
        ...(parentTicket.assignee ? [{ label: "Assignee", value: parentTicket.assignee }] : []),
      ]
    : [{ label: "Has parent", value: input.parentEntry ? "Yes" : "No" }];
  return {
    label,
    summaryItems,
    kind: parentTicket ? "jira-work-item" : "jira-ticket-parent",
    ...(parentTicket?.issueType || parentTicket?.ref.type
      ? { jiraIssueType: parentTicket?.issueType ?? parentTicket?.ref.type }
      : {}),
    ...(parentTicket?.issueTypeIconUrl || parentTicket?.ref.issueTypeIconUrl
      ? {
          jiraIssueTypeIconUrl:
            parentTicket?.issueTypeIconUrl ?? parentTicket?.ref.issueTypeIconUrl,
        }
      : {}),
  };
}

export function buildReferenceContextMenuData(input: {
  entry: RelationshipEntry;
  projectId: string;
  ticketId: string;
}) {
  const referenceTicket = toRelationshipTicket(input.entry, input.projectId);
  return {
    label: `${referenceTicket.ref.displayId} ${referenceTicket.ref.title}`,
    summaryItems: [
      {
        label: "Issue type",
        value: referenceTicket.issueType ?? referenceTicket.ref.type ?? "Issue",
      },
      { label: "Status", value: referenceTicket.status },
      ...(referenceTicket.priority ? [{ label: "Priority", value: referenceTicket.priority }] : []),
      ...(referenceTicket.assignee ? [{ label: "Assignee", value: referenceTicket.assignee }] : []),
    ],
    kind: "jira-work-item",
    ...(referenceTicket.issueType || referenceTicket.ref.type
      ? { jiraIssueType: referenceTicket.issueType ?? referenceTicket.ref.type }
      : {}),
    ...(referenceTicket.issueTypeIconUrl || referenceTicket.ref.issueTypeIconUrl
      ? {
          jiraIssueTypeIconUrl:
            referenceTicket.issueTypeIconUrl ?? referenceTicket.ref.issueTypeIconUrl,
        }
      : {}),
    dedupeKey: `${input.projectId}:${input.ticketId}:relationships:${referenceTicket.ref.displayId}`,
  };
}

export function createReferenceContextMenuHandler(input: {
  handleSectionContextMenu: ReturnType<typeof createSectionContextMenuHandler>;
  projectId: string;
  ticketId: string;
}) {
  return (event: MouseEvent, entry: RelationshipEntry) => {
    const referenceContextMenuData = buildReferenceContextMenuData({
      entry,
      projectId: input.projectId,
      ticketId: input.ticketId,
    });
    input.handleSectionContextMenu(
      event,
      "relationships",
      referenceContextMenuData.label,
      referenceContextMenuData.summaryItems,
      {
        kind: referenceContextMenuData.kind,
        dedupeKey: referenceContextMenuData.dedupeKey,
        ...(referenceContextMenuData.jiraIssueType
          ? { jiraIssueType: referenceContextMenuData.jiraIssueType }
          : {}),
        ...(referenceContextMenuData.jiraIssueTypeIconUrl
          ? { jiraIssueTypeIconUrl: referenceContextMenuData.jiraIssueTypeIconUrl }
          : {}),
      },
    );
  };
}
