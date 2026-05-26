import { type ThreadId } from "@t3tools/contracts";

import type { T3workTurnToolContext } from "./t3work-toolBroker.ts";

export function readTicketIdFromThreadToolContext(
  toolContext: T3workTurnToolContext | undefined,
): string | undefined {
  if (!toolContext || toolContext.surface !== "t3work") {
    return undefined;
  }
  if (
    !toolContext.state ||
    typeof toolContext.state !== "object" ||
    Array.isArray(toolContext.state)
  ) {
    return undefined;
  }

  const rawView = (toolContext.state as { readonly view?: unknown }).view;
  if (!rawView || typeof rawView !== "object" || Array.isArray(rawView)) {
    return undefined;
  }

  const candidate = rawView as { readonly kind?: unknown; readonly ticketId?: unknown };
  if (candidate.kind !== "thread" || typeof candidate.ticketId !== "string") {
    return undefined;
  }

  const ticketId = candidate.ticketId.trim();
  return ticketId.length > 0 ? ticketId : undefined;
}

export function createChildThreadToolContext(input: {
  readonly parentToolContext: T3workTurnToolContext | undefined;
  readonly projectId: string;
  readonly projectTitle: string;
  readonly workspaceRoot: string;
  readonly threadId: ThreadId;
  readonly threadTitle: string;
  readonly ticketId?: string;
}): T3workTurnToolContext | undefined {
  const { parentToolContext } = input;
  if (!parentToolContext || parentToolContext.surface !== "t3work") {
    return undefined;
  }

  return {
    surface: "t3work",
    tools: parentToolContext.tools,
    state: {
      view: {
        kind: "thread",
        projectId: input.projectId,
        projectTitle: input.projectTitle,
        workspaceRoot: input.workspaceRoot,
        threadId: input.threadId,
        threadTitle: input.threadTitle,
        ...(input.ticketId ? { ticketId: input.ticketId } : {}),
      },
    },
  };
}
