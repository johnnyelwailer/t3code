import type { ProjectShellProject } from "@t3tools/project-context";

import type { BackendApi } from "~/t3team/backend/t3team-types";
import {
  buildAddToChatAgentContextCapabilities,
  type AgentContextCapabilities,
} from "~/t3team/t3team-agentContext";
import { createGitHubActivityAddToChatRequest } from "~/t3team/t3team-githubActivityAttachmentRequest";
import type { GitHubWorkActivityItem } from "~/t3team/t3team-githubActivity";
import { buildJiraWorkItemSummary } from "~/t3team/t3team-jiraContextMetadata";
import type { T3TeamSidebarPinActionState } from "~/t3team/t3team-sidebarPinningTypes";
import { buildWorkItemAddToChatPayload } from "~/t3team/components/t3team-projectSidebarAddToChatRequests";
import type { ProjectTicket } from "~/t3team/t3team-types";

/** The MCP name of `t3team.work_item.get` (`T3TEAM_MCP_CANONICAL_TOOL_MAP` in the server). */
const WORK_ITEM_GET_MCP_TOOL = "t3_work_item_get";

export function buildTicketAgentContextCapabilities(
  input: {
    backend: BackendApi;
    project: ProjectShellProject;
    ticket: ProjectTicket;
    projectTickets: ReadonlyArray<ProjectTicket>;
    githubActivityItems: ReadonlyArray<GitHubWorkActivityItem>;
  },
  options?: { sidebarPin?: T3TeamSidebarPinActionState },
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
      localSnapshot: { ticket },
    },
    {
      ...(options?.sidebarPin ? { sidebarPin: options.sidebarPin } : {}),
      tools: [
        {
          id: WORK_ITEM_GET_MCP_TOOL,
          label: "Read work item",
          arguments: { issueKey: ticket.ref.displayId },
        },
      ],
    },
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
  options?: { sidebarPin?: T3TeamSidebarPinActionState },
): AgentContextCapabilities {
  return buildAddToChatAgentContextCapabilities(
    createGitHubActivityAddToChatRequest(input),
    ...(options?.sidebarPin ? [{ sidebarPin: options.sidebarPin }] : []),
  );
}
