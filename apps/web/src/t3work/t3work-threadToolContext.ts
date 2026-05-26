import {
  DEFAULT_T3WORK_THREAD_TOOL_IDS as SHARED_DEFAULT_T3WORK_THREAD_TOOL_IDS,
  listImplementedT3workToolCatalogEntries,
  type T3workToolCapability,
} from "@t3tools/project-context/t3workToolCatalog";

import type { ProjectThread, T3workThreadToolId } from "~/t3work/t3work-types";

export type T3workTurnToolCapability = T3workToolCapability;

export type T3workTurnToolDescriptor = {
  readonly id: T3workThreadToolId;
  readonly label?: string;
  readonly capabilities: ReadonlyArray<T3workTurnToolCapability>;
};

export type T3workTurnToolContext = {
  readonly surface: "t3work";
  readonly tools: ReadonlyArray<T3workTurnToolDescriptor>;
  readonly state: unknown;
};

export const T3WORK_THREAD_TOOL_DEFINITIONS = listImplementedT3workToolCatalogEntries().map(
  (tool) => ({
    id: tool.id,
    label: tool.label,
    capabilities: [...tool.capabilities],
  }),
) satisfies ReadonlyArray<T3workTurnToolDescriptor>;

export const DEFAULT_T3WORK_THREAD_TOOL_IDS = SHARED_DEFAULT_T3WORK_THREAD_TOOL_IDS;

const TOOL_BY_ID = new Map<T3workThreadToolId, T3workTurnToolDescriptor>(
  T3WORK_THREAD_TOOL_DEFINITIONS.map((tool) => [tool.id, tool]),
);

type CreateT3workTurnToolContextInput = {
  projectId: string;
  projectTitle: string;
  workspaceRoot?: string;
  threadId: string;
  threadTitle: string;
  ticketId?: string;
  selectedToolIds?: ReadonlyArray<T3workThreadToolId>;
};

export function createT3workTurnToolContext(
  input: CreateT3workTurnToolContextInput,
): T3workTurnToolContext | undefined {
  const selectedTools = [...new Set(input.selectedToolIds ?? DEFAULT_T3WORK_THREAD_TOOL_IDS)]
    .map((toolId) => TOOL_BY_ID.get(toolId))
    .filter((tool): tool is T3workTurnToolDescriptor => tool !== undefined);

  if (selectedTools.length === 0) {
    return undefined;
  }

  return {
    surface: "t3work",
    tools: selectedTools,
    state: {
      view: {
        kind: "thread",
        projectId: input.projectId,
        projectTitle: input.projectTitle,
        ...(input.workspaceRoot ? { workspaceRoot: input.workspaceRoot } : {}),
        threadId: input.threadId,
        threadTitle: input.threadTitle,
        ...(input.ticketId ? { ticketId: input.ticketId } : {}),
      },
    },
  };
}

export function mergeProjectThreadLocalState(
  existing: ProjectThread | undefined,
  next: ProjectThread,
): ProjectThread {
  if (!existing) {
    return next;
  }

  return {
    ...next,
    ...(existing.parentThreadId ? { parentThreadId: existing.parentThreadId } : {}),
    ...(existing.ticketId ? { ticketId: existing.ticketId } : {}),
    ...(existing.dashboardMode ? { dashboardMode: existing.dashboardMode } : {}),
    ...(existing.kickoffMessage ? { kickoffMessage: existing.kickoffMessage } : {}),
    ...(existing.kickoffPending !== undefined ? { kickoffPending: existing.kickoffPending } : {}),
    ...(existing.kickoffModelSelection
      ? { kickoffModelSelection: existing.kickoffModelSelection }
      : {}),
    ...(existing.kickoffRuntimeMode ? { kickoffRuntimeMode: existing.kickoffRuntimeMode } : {}),
    ...(existing.kickoffInteractionMode
      ? { kickoffInteractionMode: existing.kickoffInteractionMode }
      : {}),
    ...(existing.selectedToolIds !== undefined
      ? { selectedToolIds: existing.selectedToolIds }
      : {}),
  };
}
