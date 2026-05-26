import {
  hasT3workToolSurface,
  type T3workToolCatalogEntry,
  type T3workToolStatus,
  type T3workToolSurface,
} from "./t3workToolCatalogCore.js";
import { IMPLEMENTED_T3WORK_TOOL_CATALOG } from "./t3workToolCatalogImplemented.js";
import { PLANNED_WORK_ITEM_GITHUB_THREAD_T3WORK_TOOL_CATALOG } from "./t3workToolCatalogItemTools.js";
import { PLANNED_PROJECT_BACKLOG_MY_WORK_T3WORK_TOOL_CATALOG } from "./t3workToolCatalogProjectTools.js";

const IMPLEMENTED_T3WORK_TOOL_IDS = new Set(Object.keys(IMPLEMENTED_T3WORK_TOOL_CATALOG));

const PLANNED_PROJECT_BACKLOG_MY_WORK_TOOL_CATALOG = Object.fromEntries(
  Object.entries(PLANNED_PROJECT_BACKLOG_MY_WORK_T3WORK_TOOL_CATALOG).filter(
    ([toolId]) => !IMPLEMENTED_T3WORK_TOOL_IDS.has(toolId),
  ),
) as Readonly<Record<string, T3workToolCatalogEntry>>;

const PLANNED_WORK_ITEM_GITHUB_THREAD_TOOL_CATALOG = Object.fromEntries(
  Object.entries(PLANNED_WORK_ITEM_GITHUB_THREAD_T3WORK_TOOL_CATALOG).filter(
    ([toolId]) => !IMPLEMENTED_T3WORK_TOOL_IDS.has(toolId),
  ),
) as Readonly<Record<string, T3workToolCatalogEntry>>;

export type {
  T3workToolCapability,
  T3workToolCatalogEntry,
  T3workToolKind,
  T3workToolStatus,
  T3workToolSurface,
} from "./t3workToolCatalogCore.js";

export const T3WORK_TOOL_CATALOG = {
  ...PLANNED_PROJECT_BACKLOG_MY_WORK_TOOL_CATALOG,
  ...PLANNED_WORK_ITEM_GITHUB_THREAD_TOOL_CATALOG,
  ...IMPLEMENTED_T3WORK_TOOL_CATALOG,
} as const satisfies Record<string, T3workToolCatalogEntry>;

type T3workToolCatalog = typeof T3WORK_TOOL_CATALOG;

export type T3workToolId = keyof T3workToolCatalog;
export type T3workToolDefinition = T3workToolCatalog[T3workToolId];
export type T3workImplementedToolId = {
  [K in T3workToolId]: T3workToolCatalog[K]["status"] extends "implemented" ? K : never;
}[T3workToolId];
export type T3workImplementedToolDefinition = T3workToolCatalog[T3workImplementedToolId];

const CATALOG_ENTRIES = Object.values(T3WORK_TOOL_CATALOG) as ReadonlyArray<T3workToolDefinition>;

export function getT3workToolDefinition<TToolId extends T3workToolId>(
  id: TToolId,
): T3workToolCatalog[TToolId] {
  return T3WORK_TOOL_CATALOG[id];
}

export function isT3workToolId(value: string): value is T3workToolId {
  return value in T3WORK_TOOL_CATALOG;
}

export function isT3workImplementedToolId(value: string): value is T3workImplementedToolId {
  return isT3workToolId(value) && T3WORK_TOOL_CATALOG[value].status === "implemented";
}

export function listT3workToolCatalogEntries(input?: {
  readonly status?: T3workToolStatus;
  readonly surface?: T3workToolSurface;
}): ReadonlyArray<T3workToolDefinition> {
  return CATALOG_ENTRIES.filter((tool) => {
    if (input?.status && tool.status !== input.status) {
      return false;
    }
    if (input?.surface && !hasT3workToolSurface(tool, input.surface)) {
      return false;
    }
    return true;
  });
}

export function listImplementedT3workToolCatalogEntries(): ReadonlyArray<T3workImplementedToolDefinition> {
  return CATALOG_ENTRIES.filter(
    (tool): tool is T3workImplementedToolDefinition => tool.status === "implemented",
  );
}

export const DEFAULT_T3WORK_THREAD_TOOL_IDS = listT3workToolCatalogEntries({
  status: "implemented",
  surface: "thread",
})
  .filter((tool) => tool.defaultEnabled ?? true)
  .map((tool) => tool.id) as ReadonlyArray<T3workImplementedToolId>;
