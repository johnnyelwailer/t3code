import { useMemo } from "react";

import { createT3workTurnToolContext } from "~/t3work/t3work-threadToolContext";
import type { T3workKickoffWorkflow } from "~/t3work/t3work-types";
import type { T3workThreadToolId } from "~/t3work/t3work-types";

export function useThreadChatTurnToolContext(input: {
  readonly embeddedMode: boolean;
  readonly kickoffMessage: string | undefined;
  readonly kickoffPending: boolean | undefined;
  readonly kickoffWorkflow: T3workKickoffWorkflow | undefined;
  readonly projectId: string;
  readonly projectTitle: string;
  readonly projectWorkspaceRoot: string | undefined;
  readonly selectedToolIds: ReadonlyArray<T3workThreadToolId> | undefined;
  readonly threadId: string;
  readonly ticketId: string | undefined;
  readonly title: string;
}) {
  return useMemo(
    () =>
      createT3workTurnToolContext({
        ...(input.kickoffMessage ? { kickoffMessage: input.kickoffMessage } : {}),
        ...(input.kickoffPending !== undefined ? { kickoffPending: input.kickoffPending } : {}),
        ...(input.kickoffWorkflow ? { kickoffWorkflow: input.kickoffWorkflow } : {}),
        projectId: input.projectId,
        projectTitle: input.projectTitle,
        ...(input.projectWorkspaceRoot ? { workspaceRoot: input.projectWorkspaceRoot } : {}),
        threadId: input.threadId,
        threadTitle: input.title,
        displayMode: input.embeddedMode ? "embedded" : "thread",
        ...(input.ticketId ? { ticketId: input.ticketId } : {}),
        ...(input.selectedToolIds !== undefined ? { selectedToolIds: input.selectedToolIds } : {}),
      }),
    [
      input.embeddedMode,
      input.kickoffMessage,
      input.kickoffPending,
      input.kickoffWorkflow,
      input.projectId,
      input.projectTitle,
      input.projectWorkspaceRoot,
      input.selectedToolIds,
      input.threadId,
      input.ticketId,
      input.title,
    ],
  );
}
