import type { AppHandlersInput } from "~/t3team/t3team-appHandlersTypes";
import type { ProjectKickoffThreadInput } from "~/t3team/t3team-kickoffTypes";
import { enqueueThreadKickoffAttachments } from "~/t3team/t3team-enqueueThreadKickoffAttachments";
import { readT3TeamKickoffSendAtClickEnabled } from "~/t3team/t3team-kickoffSendAtClickFlag";
import type { ProjectThread } from "~/t3team/t3team-types";

export function createProjectKickoffThread(
  input: ProjectKickoffThreadInput,
  handlers: Pick<AppHandlersInput, "onOpenDashboard"> & {
    store: Pick<AppHandlersInput["store"], "resolveProjectId" | "createThread">;
    sendKickoffAtClick: (thread: ProjectThread) => boolean;
  },
): string {
  const { store, onOpenDashboard, sendKickoffAtClick } = handlers;
  const resolvedProjectId = store.resolveProjectId(input.projectId);
  const thread = store.createThread(resolvedProjectId, {
    ...(input.dashboardMode ? { dashboardMode: input.dashboardMode } : {}),
    title: "Project kickoff",
    kickoffMessage: input.kickoffMessage,
    kickoffPending: input.kickoffPending ?? true,
    kickoffModelSelection: input.kickoffModelSelection,
    kickoffRuntimeMode: input.kickoffRuntimeMode,
    kickoffInteractionMode: input.kickoffInteractionMode,
    selectedToolIds: input.selectedToolIds,
    ...(input.kickoffWorkflow ? { kickoffWorkflow: input.kickoffWorkflow } : {}),
  });
  enqueueThreadKickoffAttachments(thread.id, input.kickoffContextAttachments);
  if (input.sendAtClick && readT3TeamKickoffSendAtClickEnabled()) {
    sendKickoffAtClick(thread);
  }
  onOpenDashboard?.(resolvedProjectId, input.dashboardMode, thread.id);
  return thread.id;
}
