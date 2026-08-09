import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { enqueueThreadKickoffAttachments } from "~/t3team/t3team-enqueueThreadKickoffAttachments";
import { enqueueWorkItemContextSyncRequest } from "~/t3team/hooks/t3team-useWorkItemContextSyncQueue";
import type { TicketKickoffThreadInput } from "~/t3team/t3team-kickoffTypes";
import { useT3TeamPinnedSidebarStore } from "~/t3team/t3team-pinnedSidebarStore";
import { useT3TeamSidebarNavPreferencesStore } from "~/t3team/t3team-sidebarNavPreferencesStore";
import type { ProjectDashboardMode } from "~/t3team/t3team-projectDashboardModeState";
import {
  buildExistingProjectThreadViewState,
  isEmbeddedProjectThread,
} from "~/t3team/t3team-projectThreadViewState";
import { buildTicketSidebarPinnedItem } from "~/t3team/t3team-sidebarPinningTypes";
import type { ViewState } from "~/t3team/t3team-types";
import type { useBackend } from "~/t3team/backend/t3team-index";
import type { useProjectStore } from "~/t3team/hooks/t3team-useProjectStore";
import type { useThreadActions } from "~/hooks/useThreadActions";
import { readProjectIdFromView } from "~/t3team/t3team-types";

type ProjectStore = ReturnType<typeof useProjectStore>;
type Backend = ReturnType<typeof useBackend>;
type DeleteLiveThread = ReturnType<typeof useThreadActions>["deleteThread"];
type EnvironmentId = ReturnType<typeof usePrimaryEnvironmentId>;
type OnOpenDashboard =
  | ((
      projectId: string,
      dashboardMode?: ProjectDashboardMode,
      embeddedThreadId?: string | null,
    ) => void)
  | undefined;
type OnOpenTicket =
  | ((projectId: string, ticketId: string, embeddedThreadId?: string | null) => void)
  | undefined;

export function createTicketKickoffThread(input: {
  backend: Backend;
  onOpenTicket: OnOpenTicket;
  store: ProjectStore;
  threadInput: TicketKickoffThreadInput;
}) {
  const { backend, onOpenTicket, store, threadInput } = input;
  const resolvedProjectId = store.resolveProjectId(threadInput.projectId);
  const thread = store.createThreadForTicket({
    ...threadInput,
    projectId: resolvedProjectId,
  });
  useT3TeamPinnedSidebarStore.getState().pinItem(
    buildTicketSidebarPinnedItem({
      projectId: resolvedProjectId,
      ticketId: threadInput.ticketId,
    }),
  );
  useT3TeamSidebarNavPreferencesStore.getState().showItemAtTop(
    resolvedProjectId,
    buildTicketSidebarPinnedItem({
      projectId: resolvedProjectId,
      ticketId: threadInput.ticketId,
    }).id,
  );
  enqueueThreadKickoffAttachments(thread.id, threadInput.kickoffContextAttachments);
  onOpenTicket?.(resolvedProjectId, threadInput.ticketId, thread.id);

  const project = store.allProjects.find((candidate) => candidate.id === resolvedProjectId);
  const ticket = store
    .getTicketsForProject(resolvedProjectId)
    .find((candidate) => candidate.id === threadInput.ticketId);

  if (!backend || !project) return thread.id;

  // A work item that has not loaded yet cannot be attached; the sync queue attaches it once it has.
  if (!ticket) {
    enqueueWorkItemContextSyncRequest({
      id: thread.id,
      projectId: resolvedProjectId,
      ticketKey: threadInput.ticketDisplayId || threadInput.ticketId,
      threadId: thread.id,
    });
  }

  // Attaching the work item is NOT done here.
  //
  // This used to hand-roll its own add-to-chat request and enqueue it on the new thread. That request
  // was a copy of `buildTicketSidebarAddToChatRequest` minus the `dedupeKey` — and dedupe is all-or-
  // nothing, so a keyless attachment collides with nothing. Every ticket kickoff therefore attached the
  // work item twice: once here, and once from `useTicketDetailEmbeddedThreadEffects`, whose auto-attach
  // fires as soon as the kickoff navigates to the ticket view with this thread in the aside. Two chips
  // for one issue, and — because `prepareThreadContextAttachments` feeds the kickoff message — the whole
  // context bundle sent to the model twice.
  //
  // The auto-attach is the better of the two: it uses the canonical builder, so it carries the identity
  // dedupeKey and the related-ticket/GitHub context this one omitted. It covers exactly the same case,
  // because a ticket kickoff always lands on the ticket view with its thread embedded. So the redundant
  // enqueue is deleted rather than deduped — one attach path, nothing to keep in sync.
  return thread.id;
}

export function selectProjectThread(input: {
  onOpenDashboard: OnOpenDashboard;
  onOpenThread: ((projectId: string, threadId: string) => void) | undefined;
  onOpenTicket: OnOpenTicket;
  projectId: string;
  store: ProjectStore;
  threadId: string;
}) {
  const { onOpenDashboard, onOpenThread, onOpenTicket, projectId, store, threadId } = input;
  const resolvedProjectId = store.resolveProjectId(projectId);
  store.selectThread(resolvedProjectId, threadId);
  const thread = store
    .getThreadsForProject(resolvedProjectId)
    .find((candidate) => candidate.id === threadId);

  if (!thread) return void onOpenThread?.(resolvedProjectId, threadId);

  const nextView = buildExistingProjectThreadViewState(resolvedProjectId, thread);

  if (nextView.type === "ticket") {
    onOpenTicket?.(resolvedProjectId, nextView.ticketId, threadId);
    return;
  }

  if (nextView.type === "dashboard") {
    onOpenDashboard?.(resolvedProjectId, thread.dashboardMode, threadId);
    return;
  }

  onOpenThread?.(resolvedProjectId, threadId);
}

export function openEmbeddedProjectThread(input: {
  onOpenDashboard: OnOpenDashboard;
  onOpenTicket: OnOpenTicket;
  projectId: string;
  store: ProjectStore;
  threadId: string;
}) {
  const { onOpenDashboard, onOpenTicket, projectId, store, threadId } = input;
  const resolvedProjectId = store.resolveProjectId(projectId);
  const thread = store
    .getThreadsForProject(resolvedProjectId)
    .find((candidate) => candidate.id === threadId);

  if (!thread || !isEmbeddedProjectThread(thread)) return;

  store.updateThreadDisplayMode(threadId, "embedded");

  if (thread.ticketId) {
    store.selectTicket(resolvedProjectId, thread.ticketId);
    store.setView({
      type: "ticket",
      projectId: resolvedProjectId,
      ticketId: thread.ticketId,
      embeddedThreadId: threadId,
    });
    onOpenTicket?.(resolvedProjectId, thread.ticketId, threadId);
    return;
  }

  store.selectProject(resolvedProjectId);
  store.setView({
    type: "dashboard",
    projectId: resolvedProjectId,
    embeddedThreadId: threadId,
  });
  onOpenDashboard?.(resolvedProjectId, thread.dashboardMode, threadId);
}

export async function deleteAppThread(input: {
  activeView: ViewState | null;
  deleteLiveThread: DeleteLiveThread;
  environmentId: EnvironmentId;
  onOpenDashboard: OnOpenDashboard;
  onOpenTicket: OnOpenTicket;
  store: ProjectStore;
  threadId: string;
}) {
  const {
    activeView,
    deleteLiveThread,
    environmentId,
    onOpenDashboard,
    onOpenTicket,
    store,
    threadId,
  } = input;
  const thread = store.threads.find((candidate) => candidate.id === threadId);
  const deletedWasActive =
    activeView?.type === "thread"
      ? activeView.threadId === threadId
      : activeView?.type === "all-my-work"
        ? false
        : activeView?.embeddedThreadId === threadId;

  if (environmentId) {
    await deleteLiveThread(scopeThreadRef(environmentId, threadId as never));
  }

  store.deleteThread(threadId);

  if (!deletedWasActive) {
    return;
  }

  const projectId = readProjectIdFromView(activeView ?? null) ?? thread?.projectId;
  const ticketId = activeView?.type === "ticket" ? activeView.ticketId : thread?.ticketId;

  if (projectId && ticketId) {
    onOpenTicket?.(store.resolveProjectId(projectId), ticketId);
    return;
  }

  if (projectId) {
    onOpenDashboard?.(store.resolveProjectId(projectId), thread?.dashboardMode);
  }
}
