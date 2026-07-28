import { useMemo } from "react";

import { resolveT3TeamWorkflowGrantedToolIds } from "~/t3team/chat/t3team-workflowGrantedToolIds";
import {
  createT3TeamTurnToolContext,
  DEFAULT_T3TEAM_THREAD_TOOL_IDS,
} from "~/t3team/t3team-threadToolContext";
import type { T3TeamKickoffWorkflow } from "~/t3team/t3team-types";
import type { T3TeamThreadToolId } from "~/t3team/t3team-types";

/**
 * The thread's own selection, plus whatever the workflow it is launching was granted.
 *
 * Without the union the launch thread exposes only the `thread`-surface defaults, and a workflow whose
 * body calls a draft tool fails at its final step — see `t3team-workflowGrantedToolIds`.
 */
function resolveSelectedToolIds(
  selectedToolIds: ReadonlyArray<T3TeamThreadToolId> | undefined,
  kickoffWorkflow: T3TeamKickoffWorkflow | undefined,
): ReadonlyArray<T3TeamThreadToolId> | undefined {
  const granted = resolveT3TeamWorkflowGrantedToolIds(kickoffWorkflow?.allowedToolGroups);
  if (granted.length === 0) {
    return selectedToolIds;
  }
  return [...new Set([...(selectedToolIds ?? DEFAULT_T3TEAM_THREAD_TOOL_IDS), ...granted])];
}

export function useThreadChatTurnToolContext(input: {
  readonly embeddedMode: boolean;
  readonly kickoffMessage: string | undefined;
  readonly kickoffPending: boolean | undefined;
  readonly kickoffWorkflow: T3TeamKickoffWorkflow | undefined;
  readonly projectId: string;
  readonly projectTitle: string;
  readonly projectWorkspaceRoot: string | undefined;
  readonly selectedToolIds: ReadonlyArray<T3TeamThreadToolId> | undefined;
  readonly threadId: string;
  readonly ticketId: string | undefined;
  readonly ticketDisplayId: string | undefined;
  readonly title: string;
}) {
  // Memoized because the union allocates: a fresh array every render would give the tool context a new
  // identity every render, and `useThreadBootstrap` has it in its effect deps.
  const selectedToolIds = useMemo(
    () => resolveSelectedToolIds(input.selectedToolIds, input.kickoffWorkflow),
    [input.kickoffWorkflow, input.selectedToolIds],
  );

  return useMemo(
    () =>
      createT3TeamTurnToolContext({
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
        ...(input.ticketDisplayId ? { ticketDisplayId: input.ticketDisplayId } : {}),
        ...(selectedToolIds !== undefined ? { selectedToolIds } : {}),
      }),
    [
      input.embeddedMode,
      input.kickoffMessage,
      input.kickoffPending,
      input.kickoffWorkflow,
      input.projectId,
      input.projectTitle,
      input.projectWorkspaceRoot,
      selectedToolIds,
      input.threadId,
      input.ticketId,
      input.ticketDisplayId,
      input.title,
    ],
  );
}
