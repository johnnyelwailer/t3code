import type { T3workTurnToolContext } from "./t3work-toolBroker.ts";
import { T3WORK_WORK_ITEMS_INDEX_PATH as WORK_ITEMS_INDEX_PATH } from "@t3tools/project-context/t3workContextPaths";

type WorkItemsIndex = {
  readonly workItems?: ReadonlyArray<{
    readonly key?: string;
    readonly relativePath?: string;
    readonly availability?: string;
    readonly ticketEntryPointRelativePath?: string;
    readonly fullBundleRootRelativePath?: string;
    readonly updatedAt?: string;
  }>;
};

type ToolContextView = {
  readonly projectId?: string;
  readonly workspaceRoot?: string;
  readonly ticketId?: string;
  readonly ticketDisplayId?: string;
};

export function readTicketKeyArg(toolArgs: unknown): string | undefined {
  if (!toolArgs || typeof toolArgs !== "object" || Array.isArray(toolArgs)) {
    return undefined;
  }
  const ticketKey = (toolArgs as { readonly ticket_key?: unknown }).ticket_key;
  return typeof ticketKey === "string" && ticketKey.trim().length > 0
    ? ticketKey.trim()
    : undefined;
}

export function readForceRefreshArg(toolArgs: unknown): boolean {
  if (!toolArgs || typeof toolArgs !== "object" || Array.isArray(toolArgs)) {
    return false;
  }
  const value = (toolArgs as { readonly force?: unknown; readonly force_refresh?: unknown }).force;
  const fallback = (toolArgs as { readonly force_refresh?: unknown }).force_refresh;
  return value === true || fallback === true;
}

export function readToolContextView(input: T3workTurnToolContext): ToolContextView {
  if (!input.state || typeof input.state !== "object") {
    return {};
  }
  const view = (input.state as { readonly view?: unknown }).view;
  if (!view || typeof view !== "object") {
    return {};
  }
  const record = view as {
    readonly projectId?: unknown;
    readonly workspaceRoot?: unknown;
    readonly ticketId?: unknown;
    readonly ticketDisplayId?: unknown;
  };
  return {
    ...(typeof record.projectId === "string" ? { projectId: record.projectId } : {}),
    ...(typeof record.workspaceRoot === "string" ? { workspaceRoot: record.workspaceRoot } : {}),
    ...(typeof record.ticketId === "string" ? { ticketId: record.ticketId } : {}),
    ...(typeof record.ticketDisplayId === "string"
      ? { ticketDisplayId: record.ticketDisplayId }
      : {}),
  };
}

export function readBoundTicketKey(view: ToolContextView): string {
  const displayId = view.ticketDisplayId?.trim() ?? "";
  if (displayId.length > 0) {
    return displayId;
  }
  return view.ticketId?.trim() ?? "";
}

export function collectWorkItemTicketAliases(ticket: unknown): ReadonlyArray<string> {
  if (!ticket || typeof ticket !== "object") {
    return [];
  }
  const record = ticket as Record<string, unknown>;
  const ref =
    record.ref && typeof record.ref === "object"
      ? (record.ref as Record<string, unknown>)
      : undefined;
  const aliases = new Set<string>();
  for (const value of [record.id, ref?.id, ref?.displayId]) {
    if (typeof value === "string" && value.trim().length > 0) {
      aliases.add(normalizeTicketKey(value));
    }
  }
  return [...aliases];
}

export function normalizeTicketKey(value: string): string {
  return value.trim().toUpperCase();
}

export function parseWorkItemsIndex(contents: string): WorkItemsIndex | undefined {
  if (contents.trim().length === 0) {
    return {};
  }
  try {
    return JSON.parse(contents) as WorkItemsIndex;
  } catch {
    return undefined;
  }
}

export { WORK_ITEMS_INDEX_PATH, type WorkItemsIndex };
