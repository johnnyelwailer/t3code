import type { ServerProvider } from "@t3tools/contracts";
import type { ProjectShellProject } from "@t3tools/project-context";

import type { GitHubWorkActivityItem } from "~/t3team/t3team-githubActivity";
import type { TicketKickoffThreadInput } from "~/t3team/t3team-kickoffTypes";
import type { RelationshipKeyGroups } from "~/t3team/t3team-ticketRelationshipKeys";
import type { ProjectThread, ProjectTicket } from "~/t3team/t3team-types";

export type TicketDetailKickoffAsideProps = {
  project: ProjectShellProject;
  displayId: string;
  ticketTitle?: string | undefined;
  ticket: ProjectTicket | undefined;
  ticketStatus: string;
  ticketRelationshipKeys: RelationshipKeyGroups;
  relatedTickets: ReadonlyArray<ProjectTicket>;
  jiraIssueType?: string | undefined;
  ticketPriority?: string | undefined;
  issueThreads: ProjectThread[];
  projectId: string;
  projectTitle: string;
  projectWorkspaceRoot?: string;
  ticketId: string;
  activeThread: ProjectThread | null;
  githubActivityItems: ReadonlyArray<GitHubWorkActivityItem>;
  providers: ReadonlyArray<ServerProvider>;
  isConnected: boolean;
  onOpenThread: (projectId: string, threadId: string) => void;
  onOpenFullThread?: (projectId: string, threadId: string) => void;
  onThreadKickoffConsumed: (threadId: string) => void;
  onKickoffThread: (input: TicketKickoffThreadInput) => void;
};
