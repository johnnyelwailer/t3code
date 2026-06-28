import {
  T3WORK_CONTEXT_AVAILABILITY_FULL,
  type T3workContextAvailability,
} from "@t3tools/project-context/t3workContextAvailability";

import { T3WORK_PROJECT_CONTEXT_ROOT } from "~/t3work/t3work-projectSetup";
import {
  buildJiraTicketCacheRoot,
  buildJiraTicketEntryPoint,
  sanitizePathSegment,
} from "~/t3work/t3work-contextCachePaths";
import { normalizeRelationshipKey } from "~/t3work/t3work-ticketRelationshipKeys";
import type { ProjectTicket } from "~/t3work/t3work-types";

const CONTEXT_ROOT_PREFIX = `${T3WORK_PROJECT_CONTEXT_ROOT}/`;

export function normalizeScopedTicketKey(ticketKey: string): string | undefined {
  return normalizeRelationshipKey(ticketKey.trim());
}

export function buildScopedJiraTicketEntryPoint(input: {
  projectId: string;
  ticketKey: string;
}): string {
  const normalizedKey = normalizeScopedTicketKey(input.ticketKey);
  if (!normalizedKey) {
    throw new Error("ticket_key is required.");
  }
  return buildJiraTicketEntryPoint(input.projectId, normalizedKey);
}

export function assertTicketKeyInProjectScope(input: {
  projectId: string;
  ticketKey: string;
  projectTickets: ReadonlyArray<ProjectTicket>;
  currentTicketId?: string;
  currentTicketDisplayId?: string;
}): string {
  const normalizedKey = normalizeScopedTicketKey(input.ticketKey);
  if (!normalizedKey) {
    throw new Error("ticket_key is required.");
  }

  const allowedKeys = new Set<string>();
  for (const ticket of input.projectTickets) {
    for (const candidate of [ticket.id, ticket.ref.id, ticket.ref.displayId]) {
      const normalized = normalizeRelationshipKey(candidate);
      if (normalized) {
        allowedKeys.add(normalized);
      }
    }
  }
  for (const candidate of [input.currentTicketId, input.currentTicketDisplayId]) {
    const normalized = normalizeRelationshipKey(candidate);
    if (normalized) {
      allowedKeys.add(normalized);
    }
  }

  if (!allowedKeys.has(normalizedKey)) {
    throw new Error(`ticket_key '${input.ticketKey}' is outside the current project scope.`);
  }

  return normalizedKey;
}

export function assertContextRelativePathInProjectWorkspace(input: {
  projectId: string;
  relativePath: string;
}): string {
  const normalizedPath = input.relativePath.trim().replaceAll("\\", "/");
  if (
    normalizedPath.length === 0 ||
    normalizedPath.startsWith("/") ||
    !normalizedPath.startsWith(CONTEXT_ROOT_PREFIX)
  ) {
    throw new Error("Context paths must stay under the managed .t3work/context tree.");
  }

  const jiraPrefix = `${T3WORK_PROJECT_CONTEXT_ROOT}/jira/${sanitizePathSegment(input.projectId)}/`;
  if (normalizedPath.startsWith(`${T3WORK_PROJECT_CONTEXT_ROOT}/jira/`)) {
    if (!normalizedPath.startsWith(jiraPrefix)) {
      throw new Error("Jira context paths must stay within the current project cache.");
    }
  }

  return normalizedPath;
}

export function resolveTicketForScopedKey(input: {
  ticketKey: string;
  projectTickets: ReadonlyArray<ProjectTicket>;
}): ProjectTicket | undefined {
  const normalizedKey = normalizeScopedTicketKey(input.ticketKey);
  if (!normalizedKey) {
    return undefined;
  }

  return input.projectTickets.find((ticket) => {
    for (const candidate of [ticket.id, ticket.ref.id, ticket.ref.displayId]) {
      if (normalizeRelationshipKey(candidate) === normalizedKey) {
        return true;
      }
    }
    return false;
  });
}

export function readContextAvailabilityFromEntryPoint(
  entryPoint: unknown,
): T3workContextAvailability | undefined {
  if (!entryPoint || typeof entryPoint !== "object") {
    return undefined;
  }
  const availability = (entryPoint as { availability?: unknown }).availability;
  return availability === T3WORK_CONTEXT_AVAILABILITY_FULL ? availability : undefined;
}

export function buildScopedFullBundleRoot(input: { projectId: string; ticketKey: string }): string {
  const normalizedKey = normalizeScopedTicketKey(input.ticketKey);
  if (!normalizedKey) {
    throw new Error("ticket_key is required.");
  }
  return buildJiraTicketCacheRoot(input.projectId, normalizedKey);
}
