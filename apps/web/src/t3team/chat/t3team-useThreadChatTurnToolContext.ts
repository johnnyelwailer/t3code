import { useMemo } from "react";

import type { ProjectSource } from "@t3tools/project-context";
import { createT3TeamTurnToolContext } from "~/t3team/t3team-threadToolContext";
import type { T3TeamKickoffWorkflow } from "~/t3team/t3team-types";
import type { T3TeamThreadToolId } from "~/t3team/t3team-types";

export function useThreadChatTurnToolContext(input: {
  readonly embeddedMode: boolean;
  readonly kickoffMessage: string | undefined;
  readonly kickoffPending: boolean | undefined;
  readonly kickoffWorkflow: T3TeamKickoffWorkflow | undefined;
  readonly projectId: string;
  readonly projectTitle: string;
  readonly projectSource: Pick<ProjectSource, "provider"> | undefined;
  readonly projectWorkspaceRoot: string | undefined;
  readonly selectedToolIds: ReadonlyArray<T3TeamThreadToolId> | undefined;
  readonly threadId: string;
  readonly ticketId: string | undefined;
  readonly ticketDisplayId: string | undefined;
  readonly title: string;
}) {
  return useMemo(
    () =>
      createT3TeamTurnToolContext({
        ...(input.kickoffMessage ? { kickoffMessage: input.kickoffMessage } : {}),
        ...(input.kickoffPending !== undefined ? { kickoffPending: input.kickoffPending } : {}),
        ...(input.kickoffWorkflow ? { kickoffWorkflow: input.kickoffWorkflow } : {}),
        projectId: input.projectId,
        projectTitle: input.projectTitle,
        ...(input.projectSource ? { projectSource: input.projectSource } : {}),
        ...(input.projectWorkspaceRoot ? { workspaceRoot: input.projectWorkspaceRoot } : {}),
        threadId: input.threadId,
        threadTitle: input.title,
        displayMode: input.embeddedMode ? "embedded" : "thread",
        ...(input.ticketId ? { ticketId: input.ticketId } : {}),
        ...(input.ticketDisplayId ? { ticketDisplayId: input.ticketDisplayId } : {}),
        ...(input.selectedToolIds !== undefined ? { selectedToolIds: input.selectedToolIds } : {}),
      }),
    [
      input.embeddedMode,
      input.kickoffMessage,
      input.kickoffPending,
      input.kickoffWorkflow,
      input.projectId,
      input.projectTitle,
      input.projectSource,
      input.projectWorkspaceRoot,
      input.selectedToolIds,
      input.threadId,
      input.ticketId,
      input.ticketDisplayId,
      input.title,
    ],
  );
}
