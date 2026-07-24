import { cn } from "~/lib/utils";
import { resolveCanonicalProjectTicketId } from "~/t3team/t3team-ticketLookup";
import type { ProjectDashboardMode } from "~/t3team/t3team-projectDashboardModeState";
import {
  readActiveThreadIdFromView,
  type ProjectThread,
  type ProjectTicket,
  type ViewState,
} from "~/t3team/t3team-types";

const SIDEBAR_SELECTED_CLASS_NAME =
  "bg-accent/85 text-foreground font-medium hover:bg-accent hover:text-foreground dark:bg-accent/55 dark:hover:bg-accent/70";

const SIDEBAR_HOVER_CLASS_NAME = "hover:bg-accent hover:text-foreground";

export type SidebarItemState = {
  isSelected: boolean;
  isOpen: boolean;
};

function createSidebarItemState(input: {
  isSelected: boolean;
  isOpen?: boolean;
}): SidebarItemState {
  return {
    isSelected: input.isSelected,
    isOpen: input.isSelected || Boolean(input.isOpen),
  };
}

export type SidebarPinnedTicketThreadFallback = {
  ticketId: string;
  ticketDisplayId: string;
  title: string;
  ticketThreads: readonly ProjectThread[];
};

export function getSidebarTicketState(input: {
  view: ViewState | null;
  ticketId: string;
  ticketThreads: ReadonlyArray<Pick<ProjectThread, "id">>;
}): SidebarItemState {
  const { ticketId, ticketThreads, view } = input;
  const activeThreadId = readActiveThreadIdFromView(view);
  const hasActiveChildThread = Boolean(
    activeThreadId && ticketThreads.some((thread) => thread.id === activeThreadId),
  );
  const isSelected = view?.type === "ticket" && view.ticketId === ticketId && !hasActiveChildThread;

  return createSidebarItemState({
    isSelected,
    isOpen: hasActiveChildThread,
  });
}

export function isSidebarTicketActive(input: {
  view: ViewState | null;
  ticketId: string;
  ticketThreads: ReadonlyArray<Pick<ProjectThread, "id">>;
}) {
  return getSidebarTicketState(input).isOpen;
}

export function getSidebarThreadState(input: {
  view: ViewState | null;
  threadId: string;
}): SidebarItemState {
  const activeThreadId = readActiveThreadIdFromView(input.view);

  return createSidebarItemState({
    isSelected: activeThreadId === input.threadId,
    isOpen: activeThreadId === input.threadId,
  });
}

export function getSidebarProjectState(input: {
  view: ViewState | null;
  projectId: string;
}): SidebarItemState {
  return createSidebarItemState({
    isSelected: false,
    isOpen: input.view?.projectId === input.projectId,
  });
}

export function getSidebarProjectSectionState(input: {
  activeDashboardMode: ProjectDashboardMode;
  dashboardMode: ProjectDashboardMode;
  projectId: string;
  view: ViewState | null;
}): SidebarItemState {
  const isProjectViewActive = input.view?.projectId === input.projectId;
  const isSelected =
    isProjectViewActive &&
    input.view?.type === "dashboard" &&
    input.activeDashboardMode === input.dashboardMode;

  if (input.dashboardMode === "backlog") {
    return createSidebarItemState({
      isSelected,
      isOpen: isSelected,
    });
  }

  return createSidebarItemState({
    isSelected,
    isOpen: isProjectViewActive && (input.view?.type === "ticket" || input.view?.type === "thread"),
  });
}

export function getSidebarSurfaceClassName(state: SidebarItemState): string {
  void state;
  return "";
}

export function getSidebarWrappedButtonClassName(state: SidebarItemState): string {
  return cn(
    !state.isSelected && SIDEBAR_HOVER_CLASS_NAME,
    state.isSelected && SIDEBAR_SELECTED_CLASS_NAME,
  );
}

export function getSidebarStandaloneButtonClassName(state: SidebarItemState): string {
  return cn(
    !state.isSelected && SIDEBAR_HOVER_CLASS_NAME,
    state.isSelected && SIDEBAR_SELECTED_CLASS_NAME,
  );
}

export function buildPinnedTicketThreadFallbacks(
  projectThreads: ReadonlyArray<ProjectThread>,
  ticketLookup?: ReadonlyMap<string, ProjectTicket>,
): ReadonlyMap<string, SidebarPinnedTicketThreadFallback> {
  const ticketThreadsById = new Map<string, ProjectThread[]>();

  for (const thread of projectThreads) {
    const ticketId = resolveCanonicalProjectTicketId(thread.ticketId, ticketLookup);

    if (!ticketId) {
      continue;
    }

    const existing = ticketThreadsById.get(ticketId) ?? [];
    existing.push(thread);
    ticketThreadsById.set(ticketId, existing);
  }

  const fallbackByTicketId = new Map<string, SidebarPinnedTicketThreadFallback>();

  for (const [ticketId, ticketThreads] of ticketThreadsById) {
    const sortedThreads = ticketThreads.toSorted(
      (left, right) =>
        new Date(right.lastMessageAt).getTime() - new Date(left.lastMessageAt).getTime(),
    );
    const latestThread = sortedThreads[0];
    if (!latestThread) {
      continue;
    }

    fallbackByTicketId.set(ticketId, {
      ticketId,
      ticketDisplayId: latestThread.ticketDisplayId ?? latestThread.ticketId ?? ticketId,
      title: latestThread.title,
      ticketThreads: sortedThreads,
    });
  }

  return fallbackByTicketId;
}
