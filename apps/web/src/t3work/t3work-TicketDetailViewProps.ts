/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
import type { ComponentProps } from "react";
import type { ProjectShellProject } from "@t3tools/project-context";

import type { useBackendState } from "~/t3work/backend/t3work-index";
import type { useProjectGitHubActivity } from "~/t3work/hooks/t3work-useProjectGitHubActivity";
import type { useRelatedTickets } from "~/t3work/hooks/t3work-useRelatedTickets";
import type { useTicketDetail } from "~/t3work/hooks/t3work-useTicketDetail";
import { TicketDetailBody } from "~/t3work/t3work-TicketDetailBody";
import type { GitHubWorkActivityItem } from "~/t3work/t3work-githubActivity";
import type { TicketKickoffThreadInput } from "~/t3work/t3work-kickoffTypes";
import type { RelationshipKeyGroups } from "~/t3work/t3work-ticketRelationshipKeys";
import type { ProjectThread } from "~/t3work/t3work-types";
import type { TicketDetailMainColumnProps } from "~/t3work/t3work-TicketDetailMainColumn.types";
import type { TicketDetailKickoffAsideProps } from "~/t3work/t3work-TicketDetailKickoffAside";

type TicketDetailBodyMainColumnProps = TicketDetailMainColumnProps;
type TicketDetailBodyKickoffAsideProps = TicketDetailKickoffAsideProps;
type TicketDetailSnapshot = ReturnType<typeof useTicketDetail>["snapshot"];
type TicketDetailError = ReturnType<typeof useTicketDetail>["error"];
type TicketRelatedTickets = ReturnType<typeof useRelatedTickets>["relatedTickets"];
type ProjectGitHubActivityState = ReturnType<typeof useProjectGitHubActivity>;
type BackendState = ReturnType<typeof useBackendState>;

export function buildTicketDetailMainColumnProps(input: {
  snapshot: TicketDetailSnapshot;
  displayId: string;
  title: string;
  status: string;
  priority: string | undefined;
  assignee: string | undefined;
  project: ProjectShellProject;
  projectTickets: TicketRelatedTickets;
  resolvedTicketId: string;
  ticketParentId: string | undefined;
  loading: boolean;
  error: TicketDetailError;
  descriptionMarkdown: string | undefined;
  descriptionHtml: string | undefined;
  htmlBaseUrl: string | undefined;
  attachments: ReadonlyArray<Record<string, unknown>>;
  sortedComments: ReadonlyArray<Record<string, unknown>>;
  jiraLastCheckedAt: number | undefined;
  matchedGitHubActivityItems: ReadonlyArray<GitHubWorkActivityItem>;
  githubActivity: ProjectGitHubActivityState;
  onOpenTicket: (projectId: string, ticketId: string) => void;
}): TicketDetailBodyMainColumnProps {
  const {
    snapshot,
    displayId,
    title,
    status,
    priority,
    assignee,
    project,
    projectTickets,
    resolvedTicketId,
    ticketParentId,
    loading,
    error,
    descriptionMarkdown,
    descriptionHtml,
    htmlBaseUrl,
    attachments,
    sortedComments,
    jiraLastCheckedAt,
    matchedGitHubActivityItems,
    githubActivity,
    onOpenTicket,
  } = input;

  return {
    snapshot,
    displayId,
    title,
    status,
    priority,
    assignee,
    projectId: project.id,
    project,
    projectTickets,
    ticketId: resolvedTicketId,
    ticketParentId,
    snapshotParentId:
      typeof snapshot?.ref.parentId === "string" ? snapshot.ref.parentId : undefined,
    snapshotRaw: snapshot?.raw,
    onOpenTicket,
    loading,
    error,
    descriptionMarkdown,
    descriptionHtml,
    htmlBaseUrl,
    attachments: [...attachments],
    sortedComments: [...sortedComments],
    ...(jiraLastCheckedAt !== undefined ? { jiraLastCheckedAt } : {}),
    githubActivityItems: matchedGitHubActivityItems,
    ...(githubActivity.lastCheckedAt !== undefined
      ? { githubActivityLastCheckedAt: githubActivity.lastCheckedAt }
      : {}),
    githubActivityLoading: githubActivity.loading,
    ...(githubActivity.warning ? { githubActivityWarning: githubActivity.warning } : {}),
    ...(githubActivity.host ? { githubHost: githubActivity.host } : {}),
    ...(githubActivity.account ? { githubAccount: githubActivity.account } : {}),
  };
}

export function buildTicketDetailKickoffAsideProps(input: {
  project: ProjectShellProject;
  displayId: string;
  title: string;
  ticket: TicketDetailBodyKickoffAsideProps["ticket"];
  status: string;
  relationshipKeys: RelationshipKeyGroups;
  relatedTickets: TicketRelatedTickets;
  issueType: string | undefined;
  priority: string | undefined;
  issueThreads: ProjectThread[];
  resolvedTicketId: string;
  activeThread: ProjectThread | null;
  matchedGitHubActivityItems: ReadonlyArray<GitHubWorkActivityItem>;
  backendState: BackendState;
  onOpenThread: (projectId: string, threadId: string) => void;
  onOpenFullThread: (projectId: string, threadId: string) => void;
  onThreadKickoffConsumed: (threadId: string) => void;
  onKickoffThread: (input: TicketKickoffThreadInput) => void;
}): TicketDetailBodyKickoffAsideProps {
  const {
    project,
    displayId,
    title,
    ticket,
    status,
    relationshipKeys,
    relatedTickets,
    issueType,
    priority,
    issueThreads,
    resolvedTicketId,
    activeThread,
    matchedGitHubActivityItems,
    backendState,
    onOpenThread,
    onOpenFullThread,
    onThreadKickoffConsumed,
    onKickoffThread,
  } = input;

  return {
    project,
    displayId,
    ticketTitle: title,
    ticket,
    ticketStatus: status,
    ticketRelationshipKeys: relationshipKeys,
    relatedTickets,
    jiraIssueType: issueType,
    ticketPriority: priority,
    issueThreads,
    projectId: project.id,
    projectTitle: project.title,
    ...(project.workspace?.rootPath ? { projectWorkspaceRoot: project.workspace.rootPath } : {}),
    ticketId: resolvedTicketId,
    activeThread,
    githubActivityItems: matchedGitHubActivityItems,
    providers: backendState.providers,
    isConnected: backendState.connectionStatus === "connected",
    onOpenThread,
    onOpenFullThread,
    onThreadKickoffConsumed,
    onKickoffThread,
  };
}
