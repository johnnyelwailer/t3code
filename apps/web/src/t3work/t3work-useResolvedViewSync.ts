import { useEffect, useMemo } from "react";
import { mergeRouteAndStoreView } from "~/t3work/t3work-projectThreadViewState";
import { useProjectStore } from "~/t3work/hooks/t3work-useProjectStore";
import type { ProjectDashboardMode } from "~/t3work/t3work-projectDashboardModeState";
import type { ViewState } from "~/t3work/t3work-types";

export function useResolvedViewSync({
  activeDashboardMode,
  onOpenDashboard,
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

    if (onOpenDashboard) {
      onOpenDashboard(resolvedView.projectId, activeDashboardMode, view.embeddedThreadId);
      return;
    }

    store.setView(resolvedView);
  }, [activeDashboardMode, onOpenDashboard, onOpenThread, onOpenTicket, resolvedView, store, view]);
}


export function useMergedRouteAndStoreView(
  routeView: ViewState | null | undefined,
  storeView: ViewState | null,
) {
  return useMemo(() => mergeRouteAndStoreView(routeView, storeView), [routeView, storeView]);
}
