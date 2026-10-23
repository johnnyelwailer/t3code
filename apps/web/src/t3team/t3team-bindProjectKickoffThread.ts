import type { CreateProjectKickoffThread } from "~/t3team/t3team-kickoffTypes";
import type { ProjectDashboardKickoffAsideProps } from "~/t3team/t3team-ProjectDashboardKickoffAsideTypes";
import type { ProjectDashboardMode } from "~/t3team/t3team-projectDashboardModeState";

/**
 * The dashboard kickoff aside's `onKickoffThread`, bound to one project and dashboard mode. It
 * returns the created thread's id, because a Quick Start launch starts its recipe on that thread.
 */
export function bindProjectKickoffThread(
  projectId: string,
  dashboardMode: ProjectDashboardMode | undefined,
  createThread: CreateProjectKickoffThread,
): ProjectDashboardKickoffAsideProps["onKickoffThread"] {
  return (
    kickoffMessage,
    kickoffPending,
    kickoffModelSelection,
    kickoffRuntimeMode,
    kickoffInteractionMode,
    selectedToolIds,
    kickoffContextAttachments,
    kickoffWorkflow,
    sendAtClick,
  ) =>
    createThread({
      projectId,
      ...(dashboardMode ? { dashboardMode } : {}),
      kickoffMessage,
      ...(kickoffPending !== undefined ? { kickoffPending } : {}),
      kickoffModelSelection,
      kickoffRuntimeMode,
      kickoffInteractionMode,
      selectedToolIds,
      kickoffContextAttachments,
      ...(kickoffWorkflow ? { kickoffWorkflow } : {}),
      ...(sendAtClick ? { sendAtClick } : {}),
    });
}
