import type { ProjectShellProject } from "@t3tools/project-context";

import type { BackendApi } from "~/t3work/backend/t3work-types";
import type { AddToChatPayloadInput, AddToChatRequest } from "~/t3work/t3work-addToChatUtils";
import type { GitHubWorkActivityItem } from "~/t3work/t3work-githubActivity";
import { buildJiraWorkItemSummary } from "~/t3work/t3work-jiraContextMetadata";
import { buildProjectContextBundle } from "~/t3work/t3work-projectContextBundle";
import { refreshWorkItemContextBundle } from "~/t3work/t3work-refreshWorkItemContextBundle";
import type { ProjectTicket } from "~/t3work/t3work-types";

export function buildWorkItemAddToChatPayload(input: {
  backend: BackendApi;
  project: ProjectShellProject;
  ticket: ProjectTicket;
  force?: boolean;
}) {
  const jiraSummary = buildJiraWorkItemSummary(input.ticket);
  return (payloadInput?: AddToChatPayloadInput) =>
    refreshWorkItemContextBundle({
      backend: input.backend,
      project: input.project,
      ticket: input.ticket,
      summaryItems: jiraSummary.summaryItems,
      ...(input.force ? { force: true } : {}),
      ...(payloadInput?.reportProgress ? { onProgress: payloadInput.reportProgress } : {}),
    });
}

export function buildTicketSidebarAddToChatRequest(input: {
  backend: BackendApi;
  project: ProjectShellProject;
  projectId: string;
  ticket: ProjectTicket;
  projectTickets?: ReadonlyArray<ProjectTicket>;
  githubActivityItems?: ReadonlyArray<GitHubWorkActivityItem>;
}): AddToChatRequest {
  const { backend, project, projectId, ticket } = input;
  const jiraSummary = buildJiraWorkItemSummary(ticket);
  return {
    projectId,
    projectTitle: project.title,
    projectWorkspaceRoot: project.workspace?.rootPath,
    targetLabel: `${ticket.ref.displayId} ${ticket.ref.title}`,
    targetType: "work-item",
    kind: "jira-work-item",
    dedupeKey: `${project.id}:${ticket.ref.displayId}:work-item`,
    ...jiraSummary,
    payload: buildWorkItemAddToChatPayload({ backend, project, ticket }),
  };
}

export function buildProjectSidebarAddToChatRequest(input: {
  project: ProjectShellProject;
  projectTickets: ReadonlyArray<ProjectTicket>;
  linkedRepositoryUrls: ReadonlyArray<string>;
}): AddToChatRequest {
  const { project, projectTickets, linkedRepositoryUrls } = input;
  return {
    projectId: project.id,
    projectTitle: project.title,
    ...(project.workspace?.rootPath ? { projectWorkspaceRoot: project.workspace.rootPath } : {}),
    targetLabel: project.title,
    targetType: "project",
    kind: "project",
    dedupeKey: `${project.id}:project-context`,
    summaryItems: [
      { label: "Work items", value: String(projectTickets.length) },
      { label: "Linked repositories", value: String(linkedRepositoryUrls.length) },
    ],
    payload: buildProjectContextBundle({ project, linkedRepositoryUrls, projectTickets }),
  };
}
