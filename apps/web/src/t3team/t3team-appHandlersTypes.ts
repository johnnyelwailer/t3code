import type { useProjectStore } from "~/t3team/hooks/t3team-useProjectStore";
import type { ProjectDashboardMode } from "~/t3team/t3team-projectDashboardModeState";
import type { ViewState } from "~/t3team/t3team-types";

export type AppHandlersInput = {
  store: ReturnType<typeof useProjectStore>;
  activeView: ViewState | null;
  onOpenHome: (() => void) | undefined;
  onOpenDashboard:
    | ((
        projectId: string,
        dashboardMode?: ProjectDashboardMode,
        embeddedThreadId?: string | null,
      ) => void)
    | undefined;
  onOpenTicket:
    | ((projectId: string, ticketId: string, embeddedThreadId?: string | null) => void)
    | undefined;
  onOpenThread: ((projectId: string, threadId: string) => void) | undefined;
};
