import type { ProjectShellProject } from "@t3tools/project-context";

import type { BackendApi } from "~/t3team/backend/t3team-types";
import type { AddToChatPayloadInput, AddToChatRequest } from "~/t3team/t3team-addToChatUtils";
import { buildT3TeamWorkItemDedupeKey } from "~/t3team/t3team-contextAttachmentDedupeKey";
import type { GitHubWorkActivityItem } from "~/t3team/t3team-githubActivity";
import { isWorkProject } from "~/t3team/t3team-isWorkProject";
import { buildJiraWorkItemSummary } from "~/t3team/t3team-jiraContextMetadata";
import { buildProjectContextBundle } from "~/t3team/t3team-projectContextBundle";
import { refreshWorkItemContextBundle } from "~/t3team/t3team-refreshWorkItemContextBundle";
import type { ProjectTicket } from "~/t3team/t3team-types";

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
    // Identity-based, from the one builder, so any path attaching this work item collides with it.
    dedupeKey: buildT3TeamWorkItemDedupeKey({
      projectId: project.id,
      workItemKey: ticket.ref.displayId,
    }),
    ...jiraSummary,
    payload: buildWorkItemAddToChatPayload({ backend, project, ticket }),
  };
}

/**
 * The project-context bundle a new thread starts with, or `null` when there is
 * nothing worth attaching.
 *
 * A loose local workspace has no work source behind it: no backlog, no work
 * items, no linked-issue metadata. Auto-attaching its "project context" on every
 * new thread produced an empty badge the user then had to dismiss — context that
 * costs prompt space and says nothing. Explicit add-to-chat is unaffected; this
 * only decides what a thread is *born* with.
 */
export function buildNewThreadProjectContextRequest(input: {
  project: ProjectShellProject;
  projectTickets: ReadonlyArray<ProjectTicket>;
  linkedRepositoryUrls: ReadonlyArray<string>;
}): AddToChatRequest | null {
  if (!isWorkProject(input.project)) {
    return null;
  }
  return buildProjectSidebarAddToChatRequest(input);
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
