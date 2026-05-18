import type { ProjectShellProject } from "@t3tools/project-context";
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
  expanded: boolean;
  projectStatus: ThreadStatusPill | null;
  view: ViewState | null;
  threadSortOrder: ThreadSortOrder;
  threadPreviewCount: number;
  ticketViewMode: TicketViewMode;
  onSelectProject: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onSelectThread: (projectId: string, threadId: string) => void;
  onSelectTicket: (projectId: string, ticketId: string) => void;
  onManageProjectRepositories: (id: string) => void;
  onDeleteProject: (id: string) => void;
  onRenameProject: (id: string, newTitle: string) => void;
  onCreateThread: (projectId: string) => void;
  onCreateTicketThread: (input: {
    projectId: string;
    ticketId: string;
    ticketDisplayId: string;
  }) => void;
  onDeleteThread: (threadId: string) => void;
  onRenameThread: (threadId: string, newTitle: string) => void;
}
