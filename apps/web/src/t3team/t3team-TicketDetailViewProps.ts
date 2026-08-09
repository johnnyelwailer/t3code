/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
import type { ComponentProps } from "react";
import type { ProjectShellProject } from "@t3tools/project-context";

import type { useBackendState } from "~/t3team/backend/t3team-index";
import type { useProjectGitHubActivity } from "~/t3team/hooks/t3team-useProjectGitHubActivity";
import type { useRelatedTickets } from "~/t3team/hooks/t3team-useRelatedTickets";
import type { useTicketDetail } from "~/t3team/hooks/t3team-useTicketDetail";
import { TicketDetailBody } from "~/t3team/t3team-TicketDetailBody";
import type { GitHubWorkActivityItem } from "~/t3team/t3team-githubActivity";
import type { TicketKickoffThreadInput } from "~/t3team/t3team-kickoffTypes";
import type { RelationshipKeyGroups } from "~/t3team/t3team-ticketRelationshipKeys";
import type { ProjectThread } from "~/t3team/t3team-types";
import type { TicketDetailKickoffAsideProps } from "~/t3team/t3team-TicketDetailKickoffAside";

type TicketDetailBodyKickoffAsideProps = TicketDetailKickoffAsideProps;
type TicketDetailSnapshot = ReturnType<typeof useTicketDetail>["snapshot"];
type TicketDetailError = ReturnType<typeof useTicketDetail>["error"];
type TicketRelatedTickets = ReturnType<typeof useRelatedTickets>["relatedTickets"];
type ProjectGitHubActivityState = ReturnType<typeof useProjectGitHubActivity>;
type BackendState = ReturnType<typeof useBackendState>;

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
