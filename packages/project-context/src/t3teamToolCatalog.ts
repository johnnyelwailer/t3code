import {
  hasT3TeamToolSurface,
  type T3TeamToolCatalogEntry,
  type T3TeamToolStatus,
  type T3TeamToolSurface,
} from "./t3teamToolCatalogCore.ts";
import { IMPLEMENTED_T3TEAM_TOOL_CATALOG } from "./t3teamToolCatalogImplemented.ts";
import {
  IMPLEMENTED_T3TEAM_BACKLOG_TOOL_CATALOG,
  IMPLEMENTED_T3TEAM_DRAFT_TOOL_CATALOG,
} from "./t3teamToolCatalogImplementedDrafts.ts";
import { PLANNED_WORK_ITEM_GITHUB_THREAD_T3TEAM_TOOL_CATALOG } from "./t3teamToolCatalogItemTools.ts";
import { PLANNED_PROJECT_BACKLOG_MY_WORK_T3TEAM_TOOL_CATALOG } from "./t3teamToolCatalogProjectTools.ts";

const IMPLEMENTED_T3TEAM_TOOL_IDS = new Set([
  ...Object.keys(IMPLEMENTED_T3TEAM_TOOL_CATALOG),
  ...Object.keys(IMPLEMENTED_T3TEAM_BACKLOG_TOOL_CATALOG),
  ...Object.keys(IMPLEMENTED_T3TEAM_DRAFT_TOOL_CATALOG),
]);

const PLANNED_PROJECT_BACKLOG_MY_WORK_TOOL_CATALOG = Object.fromEntries(
  Object.entries(PLANNED_PROJECT_BACKLOG_MY_WORK_T3TEAM_TOOL_CATALOG).filter(
    ([toolId]) => !IMPLEMENTED_T3TEAM_TOOL_IDS.has(toolId),
  ),
) as Readonly<Record<string, T3TeamToolCatalogEntry>>;

const PLANNED_WORK_ITEM_GITHUB_THREAD_TOOL_CATALOG = Object.fromEntries(
  Object.entries(PLANNED_WORK_ITEM_GITHUB_THREAD_T3TEAM_TOOL_CATALOG).filter(
    ([toolId]) => !IMPLEMENTED_T3TEAM_TOOL_IDS.has(toolId),
  ),
) as Readonly<Record<string, T3TeamToolCatalogEntry>>;

export type {
  T3TeamToolCapability,
  T3TeamToolCatalogEntry,
  T3TeamToolKind,
  T3TeamToolStatus,
  T3TeamToolSurface,
} from "./t3teamToolCatalogCore.ts";
export {
  requiresWorkSourceT3TeamTool,
  WORK_SOURCE_ONLY_T3TEAM_TOOL_SURFACES,
} from "./t3teamToolCatalogCore.ts";

export const T3TEAM_TOOL_CATALOG = {
  ...PLANNED_PROJECT_BACKLOG_MY_WORK_TOOL_CATALOG,
  ...PLANNED_WORK_ITEM_GITHUB_THREAD_TOOL_CATALOG,
  ...IMPLEMENTED_T3TEAM_TOOL_CATALOG,
  // `IMPLEMENTED_T3TEAM_BACKLOG_TOOL_CATALOG` / `IMPLEMENTED_T3TEAM_DRAFT_TOOL_CATALOG` were
  // previously defined but never merged in here, so none of the backlog/work-item
  // draft-mutation tools (assignee, estimate, status, subtask, description, comment, link, ...)
  // were ever resolvable via `getT3TeamToolDefinition`/`listImplementedT3TeamToolCatalogEntries`
  // — the machinery existed but was disconnected from the catalog an agent's tool list is built
  // from. Spread last so an implemented entry always wins over any same-id planned placeholder.
  ...IMPLEMENTED_T3TEAM_BACKLOG_TOOL_CATALOG,
  ...IMPLEMENTED_T3TEAM_DRAFT_TOOL_CATALOG,
} as const satisfies Record<string, T3TeamToolCatalogEntry>;

type T3TeamToolCatalog = typeof T3TEAM_TOOL_CATALOG;

export type T3TeamToolId = keyof T3TeamToolCatalog;
export type T3TeamToolDefinition = T3TeamToolCatalog[T3TeamToolId];
export type T3TeamImplementedToolId = {
  [K in T3TeamToolId]: T3TeamToolCatalog[K]["status"] extends "implemented" ? K : never;
}[T3TeamToolId];
export type T3TeamImplementedToolDefinition = T3TeamToolCatalog[T3TeamImplementedToolId];

const CATALOG_ENTRIES = Object.values(T3TEAM_TOOL_CATALOG) as ReadonlyArray<T3TeamToolDefinition>;

export function getT3TeamToolDefinition<TToolId extends T3TeamToolId>(
  id: TToolId,
): T3TeamToolCatalog[TToolId] {
  return T3TEAM_TOOL_CATALOG[id];
}

export function isT3TeamToolId(value: string): value is T3TeamToolId {
  return value in T3TEAM_TOOL_CATALOG;
}

export function isT3TeamImplementedToolId(value: string): value is T3TeamImplementedToolId {
  return isT3TeamToolId(value) && T3TEAM_TOOL_CATALOG[value].status === "implemented";
}

export function listT3TeamToolCatalogEntries(input?: {
  readonly status?: T3TeamToolStatus;
  readonly surface?: T3TeamToolSurface;
}): ReadonlyArray<T3TeamToolDefinition> {
  return CATALOG_ENTRIES.filter((tool) => {
    if (input?.status && tool.status !== input.status) {
      return false;
    }
    if (input?.surface && !hasT3TeamToolSurface(tool, input.surface)) {
      return false;
    }
    return true;
  });
}

export function listImplementedT3TeamToolCatalogEntries(): ReadonlyArray<T3TeamImplementedToolDefinition> {
  return CATALOG_ENTRIES.filter(
    (tool): tool is T3TeamImplementedToolDefinition => tool.status === "implemented",
  );
}

export const DEFAULT_T3TEAM_THREAD_TOOL_IDS = listT3TeamToolCatalogEntries({
  status: "implemented",
  surface: "thread",
})
  .filter((tool) => tool.defaultEnabled ?? true)
  .map((tool) => tool.id) as ReadonlyArray<T3TeamImplementedToolId>;
