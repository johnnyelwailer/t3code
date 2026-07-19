import type { useProjectStore } from "~/t3work/hooks/t3work-useProjectStore";
import type { ProjectDashboardMode } from "~/t3work/t3work-projectDashboardModeState";
import type { ViewState } from "~/t3work/t3work-types";

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
