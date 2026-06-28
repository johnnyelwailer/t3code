import type { ProjectShellProject } from "@t3tools/project-context";

import type { BackendApi } from "~/t3work/backend/t3work-types";
import {
  buildAddToChatAgentContextCapabilities,
  type AgentContextCapabilities,
} from "~/t3work/t3work-agentContext";
import { createGitHubActivityAddToChatRequest } from "~/t3work/t3work-githubActivityAttachmentRequest";
import type { GitHubWorkActivityItem } from "~/t3work/t3work-githubActivity";
import { buildJiraWorkItemSummary } from "~/t3work/t3work-jiraContextMetadata";
import type { T3WorkSidebarPinActionState } from "~/t3work/t3work-sidebarPinningTypes";
import { buildWorkItemAddToChatPayload } from "~/t3work/components/t3work-projectSidebarAddToChatRequests";
import type { ProjectTicket } from "~/t3work/t3work-types";

export function buildTicketAgentContextCapabilities(
  input: {
    backend: BackendApi;
    project: ProjectShellProject;
    ticket: ProjectTicket;
    projectTickets: ReadonlyArray<ProjectTicket>;
    githubActivityItems: ReadonlyArray<GitHubWorkActivityItem>;
  },
  options?: { sidebarPin?: T3WorkSidebarPinActionState },
): AgentContextCapabilities {
  const { backend, project, ticket } = input;
  const jiraSummary = buildJiraWorkItemSummary(ticket);

  return buildAddToChatAgentContextCapabilities(
    {
      projectId: project.id,
      projectTitle: project.title,
      ...(project.workspace?.rootPath ? { projectWorkspaceRoot: project.workspace.rootPath } : {}),
      targetLabel: `${ticket.ref.displayId} ${ticket.ref.title}`,
      targetType: "work-item",
      kind: "jira-work-item",
      dedupeKey: `${project.id}:${ticket.ref.displayId}:work-item`,
      ...(jiraSummary.jiraIssueType ? { jiraIssueType: jiraSummary.jiraIssueType } : {}),
      ...(jiraSummary.jiraIssueTypeIconUrl
        ? { jiraIssueTypeIconUrl: jiraSummary.jiraIssueTypeIconUrl }
        : {}),
      summaryItems: jiraSummary.summaryItems,
      payload: buildWorkItemAddToChatPayload({ backend, project, ticket }),
    },
    ...(options?.sidebarPin ? [{ sidebarPin: options.sidebarPin }] : []),
  );
}

export function buildGitHubActivityAgentContextCapabilities(
  input: {
    backend?: BackendApi | null | undefined;
    project: ProjectShellProject;
    item: GitHubWorkActivityItem;
    linkedWorkItem?: ProjectTicket | null;
    projectTickets?: ReadonlyArray<ProjectTicket>;
    githubActivityItems?: ReadonlyArray<GitHubWorkActivityItem>;
    fallbackHost?: string;
  },
  options?: { sidebarPin?: T3WorkSidebarPinActionState },
): AgentContextCapabilities {
  return buildAddToChatAgentContextCapabilities(
    createGitHubActivityAddToChatRequest(input),
    ...(options?.sidebarPin ? [{ sidebarPin: options.sidebarPin }] : []),
  );
}
