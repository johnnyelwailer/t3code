import { useEffect } from "react";
import { useProjectStore } from "~/t3team/hooks/t3team-useProjectStore";
import type { ProjectDashboardMode } from "~/t3team/t3team-projectDashboardModeState";
import type { ViewState } from "~/t3team/t3team-types";

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
    if (!view || !resolvedView) {
      return;
    }

    // A draft view is routed by draft id and has no project of its own, so
    // there is nothing to reconcile here — falling through would push the user
    // onto a dashboard and abandon the draft they just opened.
    if (view.type === "draft" || resolvedView.type === "draft") {
      return;
    }

    if (resolvedView.projectId === view.projectId) {
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
