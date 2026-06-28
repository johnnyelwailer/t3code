import type { ProjectShellProject } from "@t3tools/project-context";
import type { ProjectDashboardMode } from "~/t3work/t3work-projectDashboardModeState";
import type { ProjectSidebarState } from "~/t3work/t3work-projectSidebarState";
import type {
  ProjectSortOrder,
  ProjectThread,
  ThreadSortOrder,
  ViewState,
} from "~/t3work/t3work-types";

export interface ProjectSidebarProps {
  projects: ProjectShellProject[];
  looseWorkspaceProjects: ProjectShellProject[];
  selectedId: string | null;
  expandedIds: Set<string>;
  threads: ProjectThread[];
  getThreadsForProject: (projectId: string) => ProjectThread[];
  view: ViewState | null;
  projectSortOrder: ProjectSortOrder;
  threadSortOrder: ThreadSortOrder;
  threadPreviewCount: number;
  sidebarState: ProjectSidebarState;
  activeDashboardMode: ProjectDashboardMode;
  onSelectProject: (id: string) => void;
  onSelectProjectDashboardMode: (projectId: string, dashboardMode: ProjectDashboardMode) => void;
  onSelectTicket: (projectId: string, ticketId: string) => void;
  onSelectThread: (projectId: string, threadId: string) => void;
  onToggleExpand: (id: string) => void;
  onOpenSearch: () => void;
  onCreateProject: () => void;
  onOpenSettings: (() => void) | undefined;
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
  onProjectSortOrderChange: (sortOrder: ProjectSortOrder) => void;
  onThreadSortOrderChange: (sortOrder: ThreadSortOrder) => void;
  onThreadPreviewCountChange: (count: number) => void;
  onSidebarStateChange: (
    value: ProjectSidebarState | ((current: ProjectSidebarState) => ProjectSidebarState),
  ) => void;
}
