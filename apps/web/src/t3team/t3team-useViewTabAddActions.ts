import type { ScopedThreadRef } from "@t3tools/contracts";

import { useRightPanelStore } from "~/rightPanelStore";
import type { T3TeamViewTabSource } from "~/t3team/t3team-chatViewExtensions";
import { useT3TeamSidebarThreadDataStore } from "~/t3team/t3team-sidebarThreadDataStore";
import { viewTargetIcon, type T3TeamAddSurfaceAction } from "~/t3team/t3team-viewTabPresentation";
import type { T3TeamViewTarget } from "~/t3team/t3team-viewTarget";

/** The view tabs a thread's panel offers: its project's My Work, and its work item when it has one. */
export function viewTabAddActions(input: {
  readonly source: T3TeamViewTabSource;
  readonly ticketTitle: string | null;
  readonly open: (target: T3TeamViewTarget) => void;
}): T3TeamAddSurfaceAction[] {
  const { source, ticketTitle, open } = input;
  const myWork: T3TeamViewTarget = { kind: "my-work", projectId: source.projectId };
  const actions: T3TeamAddSurfaceAction[] = [
    {
      label: "My Work",
      description: "This project's work, beside the chat.",
      icon: viewTargetIcon(myWork),
      shortcut: "W",
      available: true,
      disabledReason: "",
      onClick: () => open(myWork),
    },
  ];
  if (source.ticketId === undefined) return actions;
  const displayId = source.ticketDisplayId ?? source.ticketId;
  const workItem: T3TeamViewTarget = {
    kind: "work-item",
    projectId: source.projectId,
    ticketId: source.ticketId,
    displayId,
    ...(ticketTitle ? { title: ticketTitle } : {}),
  };
  actions.push({
    label: `Work item ${displayId}`,
    description: "The work item this thread belongs to.",
    icon: viewTargetIcon(workItem),
    shortcut: "I",
    available: true,
    disabledReason: "",
    onClick: () => open(workItem),
  });
  return actions;
}

export function useViewTabAddActions(
  threadRef: ScopedThreadRef | null,
  source: T3TeamViewTabSource | undefined,
): T3TeamAddSurfaceAction[] | undefined {
  const ticketTitle = useT3TeamSidebarThreadDataStore((state) =>
    threadRef !== null && source?.ticketId !== undefined
      ? (state.attributionByThreadId.get(threadRef.threadId)?.title ?? null)
      : null,
  );
  const projectId = source?.projectId;
  const ticketId = source?.ticketId;
  const ticketDisplayId = source?.ticketDisplayId;
  if (threadRef === null || projectId === undefined) return undefined;
  return viewTabAddActions({
    source: {
      projectId,
      ...(ticketId === undefined ? {} : { ticketId }),
      ...(ticketDisplayId === undefined ? {} : { ticketDisplayId }),
    },
    ticketTitle,
    open: (target) => useRightPanelStore.getState().openView(threadRef, target),
  });
}
