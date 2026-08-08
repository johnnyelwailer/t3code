/**
 * The shell's props and layout constants. Split out on the same convention as
 * `t3team-TicketDetailViewProps.ts`: the route surface and the shell both need to name this
 * contract, and neither should have to import the component to do it.
 */
import type { ProjectShellProject } from "@t3tools/project-context";
import type { ProjectDashboardMode } from "~/t3team/t3team-projectDashboardModeState";
import type { ViewState } from "~/t3team/t3team-types";

export type AppProps = {
  view?: ViewState | null;
  dashboardMode?: ProjectDashboardMode;
  showCreate?: boolean;
  reopenInitialSetup?: boolean;
  onCreateOpenChange?: (open: boolean) => void;
  onOpenHome?: () => void;
  onOpenSettings?: () => void;
  onOpenDashboard?: (
    projectId: string,
    dashboardMode?: ProjectDashboardMode,
    embeddedThreadId?: string | null,
  ) => void;
  onOpenTicket?: (projectId: string, ticketId: string, embeddedThreadId?: string | null) => void;
  onOpenThread?: (projectId: string, threadId: string) => void;
  onCloseEmbeddedThread?: () => void;
  onProjectCreated?: (project: ProjectShellProject) => void;
};

export const T3TEAM_LEFT_SIDEBAR_WIDTH_STORAGE_KEY = "t3team_left_sidebar_width";
export const T3TEAM_LEFT_SIDEBAR_MIN_WIDTH = 16 * 16;
export const T3TEAM_MAIN_CONTENT_MIN_WIDTH = 44 * 16;
