import type { ProjectShellProject } from "@t3tools/project-context";
import type { ProjectDashboardMode } from "~/t3work/t3work-projectDashboardModeState";
import type {
  ProjectThread,
  ProjectTicket,
  ThreadSortOrder,
  ThreadStatusPill,
  ViewState,
} from "~/t3work/t3work-types";
import type { TicketViewMode } from "./t3work-projectSidebarShared";

export interface ProjectRowProps {
  project: ProjectShellProject;
  projectThreads: ProjectThread[];
  projectTickets: ProjectTicket[];
  jiraLastCheckedAt?: number;
  expanded: boolean;
  projectStatus: ThreadStatusPill | null;
  view: ViewState | null;
  activeDashboardMode: ProjectDashboardMode;
  threadSortOrder: ThreadSortOrder;
  threadPreviewCount: number;
  ticketViewMode: TicketViewMode;
  showProjectThreads: boolean;
  showMyActivityFeed: boolean;
  showJiraItems: boolean;
  showGitHubActivity: boolean;
  onSelectProject: (id: string) => void;
  onSelectProjectDashboardMode: (projectId: string, dashboardMode: ProjectDashboardMode) => void;
  onToggleExpand: (id: string) => void;
  onSelectThread: (projectId: string, threadId: string) => void;
  onSelectTicket: (projectId: string, ticketId: string) => void;
  onManageProjectRecipes: (id: string) => void;
  onManageProjectRepositories: (id: string) => void;
  onDeleteProject: (id: string) => void;
  onRenameProject: (id: string, newTitle: string) => void;
  onCreateThread: (projectId: string) => string;
  onCreateTicketThread: (input: {
    projectId: string;
    ticketId: string;
    ticketDisplayId: string;
  }) => string;
  onDeleteThread: (threadId: string) => void;
  onRenameThread: (threadId: string, newTitle: string) => void;
}
