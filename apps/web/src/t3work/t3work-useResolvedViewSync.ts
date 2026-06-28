import { useEffect } from "react";
import { useProjectStore } from "~/t3work/hooks/t3work-useProjectStore";
import type { ProjectDashboardMode } from "~/t3work/t3work-projectDashboardModeState";
import type { ViewState } from "~/t3work/t3work-types";

export function useResolvedViewSync({
  activeDashboardMode,
  onOpenDashboard,
  onOpenProjectRecipes,
  onOpenThread,
  onOpenTicket,
  resolvedView,
  store,
  view,
}: {
  activeDashboardMode: ProjectDashboardMode;
  onOpenDashboard:
    | ((
        projectId: string,
        dashboardMode?: ProjectDashboardMode,
        embeddedThreadId?: string | null,
      ) => void)
    | undefined;
  onOpenProjectRecipes: ((projectId: string) => void) | undefined;
  onOpenThread: ((projectId: string, threadId: string) => void) | undefined;
  onOpenTicket:
    | ((projectId: string, ticketId: string, embeddedThreadId?: string | null) => void)
    | undefined;
  resolvedView: ViewState | null;
  store: ReturnType<typeof useProjectStore>;
  view: ViewState | null | undefined;
}) {
  useEffect(() => {
    if (!view || !resolvedView || resolvedView.projectId === view.projectId) {
      return;
    }

    if (view.type === "thread") {
      if (onOpenThread) {
        onOpenThread(resolvedView.projectId, view.threadId);
        return;
      }
      store.setView(resolvedView);
      return;
    }

    if (view.type === "ticket") {
      if (onOpenTicket) {
        onOpenTicket(resolvedView.projectId, view.ticketId, view.embeddedThreadId);
        return;
      }
      store.setView(resolvedView);
      return;
    }

    if (view.type === "recipes") {
      if (onOpenProjectRecipes) {
        onOpenProjectRecipes(resolvedView.projectId);
        return;
      }
      store.setView(resolvedView);
      return;
    }

    if (onOpenDashboard) {
      onOpenDashboard(resolvedView.projectId, activeDashboardMode, view.embeddedThreadId);
      return;
    }

    store.setView(resolvedView);
  }, [
    activeDashboardMode,
    onOpenDashboard,
    onOpenProjectRecipes,
    onOpenThread,
    onOpenTicket,
    resolvedView,
    store,
    view,
  ]);
}
