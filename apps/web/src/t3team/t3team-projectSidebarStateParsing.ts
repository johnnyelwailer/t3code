import type { TicketViewMode } from "~/t3team/components/t3team-projectSidebarShared";
import type { ProjectSortOrder, ThreadSortOrder } from "~/t3team/t3team-types";

export const projectSortOrderValues = new Set<ProjectSortOrder>(["updated_at", "created_at"]);
export const threadSortOrderValues = new Set<ThreadSortOrder>(["updated_at", "created_at"]);
export const ticketViewModeValues = new Set<TicketViewMode>(["flat", "tree"]);

export function parseRouteEnum<TValue extends string>(
  value: unknown,
  allowedValues: ReadonlySet<TValue>,
): TValue | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  return allowedValues.has(value as TValue) ? (value as TValue) : undefined;
}

export function parseRouteBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  if (value === "1" || value === "true") {
    return true;
  }

  if (value === "0" || value === "false") {
    return false;
  }

  return undefined;
}

export function parseRouteInteger(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parsePersistedBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

export function clampProjectSidebarThreadPreviewCount(value: number): number {
  return Math.min(20, Math.max(1, Math.trunc(value)));
}
