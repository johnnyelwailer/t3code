import {
  DEFAULT_T3WORK_THREAD_TOOL_IDS as SHARED_DEFAULT_T3WORK_THREAD_TOOL_IDS,
  listImplementedT3workToolCatalogEntries,
  type T3workToolCapability,
} from "@t3tools/project-context/t3workToolCatalog";

import type {
  ProjectThread,
  ProjectThreadDisplayMode,
  T3workKickoffWorkflow,
  T3workThreadToolId,
} from "~/t3work/t3work-types";

import { projectThreadsEqual } from "~/t3work/t3work-threadToolContextEquality";

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
  kickoffMessage?: string;
  kickoffPending?: boolean;
  kickoffWorkflow?: T3workKickoffWorkflow;
  projectId: string;
  projectTitle: string;
  workspaceRoot?: string;
  threadId: string;
  threadTitle: string;
  displayMode?: ProjectThreadDisplayMode;
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
        displayMode: input.displayMode ?? "thread",
        ...(input.ticketId ? { ticketId: input.ticketId } : {}),
      },
      ...(input.kickoffMessage || input.kickoffWorkflow || input.kickoffPending !== undefined
        ? {
            kickoff: {
              ...(input.kickoffMessage ? { message: input.kickoffMessage } : {}),
              ...(input.kickoffPending !== undefined ? { pending: input.kickoffPending } : {}),
              ...(input.kickoffWorkflow
                ? {
                    workflow: {
                      kind: input.kickoffWorkflow.kind,
                      recipeId: input.kickoffWorkflow.recipeId,
                      ...(input.kickoffWorkflow.recipeVersion
                        ? { recipeVersion: input.kickoffWorkflow.recipeVersion }
                        : {}),
                      ...(input.kickoffWorkflow.parameters
                        ? { parameters: input.kickoffWorkflow.parameters }
                        : {}),
                      title: input.kickoffWorkflow.title,
                      description: input.kickoffWorkflow.description,
                      source: input.kickoffWorkflow.source,
                      surface: input.kickoffWorkflow.surface,
                      ...(input.kickoffWorkflow.reason
                        ? { reason: input.kickoffWorkflow.reason }
                        : {}),
                    },
                  }
                : {}),
            },
          }
        : {}),
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
    ...(existing.ticketDisplayId ? { ticketDisplayId: existing.ticketDisplayId } : {}),
    ...(existing.dashboardMode ? { dashboardMode: existing.dashboardMode } : {}),
    ...(existing.displayMode ? { displayMode: existing.displayMode } : {}),
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
    ...(existing.kickoffWorkflow ? { kickoffWorkflow: existing.kickoffWorkflow } : {}),
  };
}

function projectThreadArraysEqual(
  left: ReadonlyArray<string> | undefined,
  right: ReadonlyArray<string> | undefined,
): boolean {
  if (left === right) {
    return true;
  }

  if (!left || !right || left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

export function upsertProjectThreadLocalState(
  threads: ReadonlyArray<ProjectThread>,
  next: ProjectThread,
): ProjectThread[] {
  const existingIndex = threads.findIndex((thread) => thread.id === next.id);
  if (existingIndex < 0) {
    return [...threads, next];
  }

  const existing = threads[existingIndex]!;
  const merged = mergeProjectThreadLocalState(existing, next);
  if (projectThreadsEqual(existing, merged)) {
    return threads as ProjectThread[];
  }

  return threads.map((thread, index) => (index === existingIndex ? merged : thread));
}

export function setProjectThreadDisplayMode(
  threads: ReadonlyArray<ProjectThread>,
  threadId: string,
  displayMode: ProjectThreadDisplayMode,
  fallbackThread?: ProjectThread,
): ProjectThread[] {
  const existing = threads.find((thread) => thread.id === threadId);
  if (existing) {
    if (existing.displayMode === displayMode) {
      return threads as ProjectThread[];
    }

    return threads.map((thread) => (thread.id === threadId ? { ...thread, displayMode } : thread));
  }

  if (!fallbackThread) {
    return threads as ProjectThread[];
  }

  return upsertProjectThreadLocalState(threads, { ...fallbackThread, displayMode });
}
