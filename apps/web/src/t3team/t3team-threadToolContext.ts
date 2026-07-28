/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
import type { ProjectSource } from "@t3tools/project-context";
import {
  DEFAULT_T3TEAM_THREAD_TOOL_IDS as SHARED_DEFAULT_T3TEAM_THREAD_TOOL_IDS,
  listImplementedT3TeamToolCatalogEntries,
  type T3TeamToolCapability,
} from "@t3tools/project-context/t3teamToolCatalog";

import type {
  ProjectThread,
  ProjectThreadDisplayMode,
  T3TeamKickoffWorkflow,
  T3TeamThreadToolId,
} from "~/t3team/t3team-types";

import { projectThreadsEqual } from "~/t3team/t3team-threadToolContextEquality";
import { buildT3TeamKickoffState } from "~/t3team/t3team-threadToolContextKickoff";
import { resolveT3TeamThreadToolIds } from "~/t3team/t3team-toolPolicy";

export type T3TeamTurnToolCapability = T3TeamToolCapability;

export type T3TeamTurnToolDescriptor = {
  readonly id: T3TeamThreadToolId;
  readonly label?: string;
  readonly capabilities: ReadonlyArray<T3TeamTurnToolCapability>;
};

export type T3TeamTurnToolContext = {
  readonly surface: "t3team";
  readonly tools: ReadonlyArray<T3TeamTurnToolDescriptor>;
  readonly state: unknown;
};

export const T3TEAM_THREAD_TOOL_DEFINITIONS = listImplementedT3TeamToolCatalogEntries().map(
  (tool) => ({
    id: tool.id,
    label: tool.label,
    capabilities: [...tool.capabilities],
  }),
) satisfies ReadonlyArray<T3TeamTurnToolDescriptor>;

export const DEFAULT_T3TEAM_THREAD_TOOL_IDS = SHARED_DEFAULT_T3TEAM_THREAD_TOOL_IDS;

const TOOL_BY_ID = new Map<T3TeamThreadToolId, T3TeamTurnToolDescriptor>(
  T3TEAM_THREAD_TOOL_DEFINITIONS.map((tool) => [tool.id, tool]),
);

type CreateT3TeamTurnToolContextInput = {
  kickoffMessage?: string;
  kickoffPending?: boolean;
  kickoffWorkflow?: T3TeamKickoffWorkflow;
  projectId: string;
  projectTitle: string;
  workspaceRoot?: string;
  threadId: string;
  threadTitle: string;
  displayMode?: ProjectThreadDisplayMode;
  ticketId?: string;
  ticketDisplayId?: string;
  selectedToolIds?: ReadonlyArray<T3TeamThreadToolId>;
  // See t3team-toolPolicy.ts; absent projectSource keeps the catalog unfiltered.
  projectSource?: Pick<ProjectSource, "provider">;
};

export function createT3TeamTurnToolContext(
  input: CreateT3TeamTurnToolContextInput,
): T3TeamTurnToolContext | undefined {
  const allowedToolIds = resolveT3TeamThreadToolIds({
    projectSource: input.projectSource,
    candidateToolIds: input.selectedToolIds ?? DEFAULT_T3TEAM_THREAD_TOOL_IDS,
  });
  const selectedTools = [...new Set(allowedToolIds)]
    .map((toolId) => TOOL_BY_ID.get(toolId))
    .filter((tool): tool is T3TeamTurnToolDescriptor => tool !== undefined);

  if (selectedTools.length === 0) {
    return undefined;
  }

  const kickoffState = buildT3TeamKickoffState(input);

  return {
    surface: "t3team",
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
        ...(input.ticketDisplayId ? { ticketDisplayId: input.ticketDisplayId } : {}),
      },
      ...(kickoffState ? { kickoff: kickoffState } : {}),
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
