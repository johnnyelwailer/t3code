import type { T3workTurnToolContext } from "./t3work-toolBroker.ts";

const WORK_ITEMS_INDEX_PATH = ".t3work/context/work-items/index.json";

type WorkItemsIndex = {
  readonly workItems?: ReadonlyArray<{
    readonly key?: string;
    readonly availability?: string;
    readonly ticketEntryPointRelativePath?: string;
  }>;
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

export function readToolContextView(input: T3workTurnToolContext): {
  projectId?: string;
  workspaceRoot?: string;
  ticketId?: string;
} {
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
  };
  return {
    ...(typeof record.projectId === "string" ? { projectId: record.projectId } : {}),
    ...(typeof record.workspaceRoot === "string" ? { workspaceRoot: record.workspaceRoot } : {}),
    ...(typeof record.ticketId === "string" ? { ticketId: record.ticketId } : {}),
  };
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
