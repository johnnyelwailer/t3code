import type { AppHandlersInput } from "~/t3team/t3team-appHandlersTypes";
import type { ProjectKickoffThreadInput } from "~/t3team/t3team-kickoffTypes";
import { enqueueThreadKickoffAttachments } from "~/t3team/t3team-enqueueThreadKickoffAttachments";

export function createProjectKickoffThread(
  input: ProjectKickoffThreadInput,
  handlers: Pick<AppHandlersInput, "store" | "onOpenDashboard">,
): string {
  const { store, onOpenDashboard } = handlers;
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
  onOpenDashboard?.(resolvedProjectId, input.dashboardMode, thread.id);
  return thread.id;
}
