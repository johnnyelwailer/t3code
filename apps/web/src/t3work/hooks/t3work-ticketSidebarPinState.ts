import type { ProjectShellProject } from "@t3tools/project-context";

import type { Project } from "~/types";
import { buildTicketSidebarPinnedItemId } from "~/t3work/t3work-sidebarPinningTypes";
import type { T3WorkSidebarPinnedItem } from "~/t3work/t3work-sidebarPinningTypes";
import type { ProjectTicket } from "~/t3work/t3work-types";
import { loadStoredProjects } from "./t3work-projectStoreUtils";
import { resolveCanonicalProjectId, resolveStoredProjectId } from "./t3work-threadBridge";

export function resolveTicketAgentContextPinnedProjectState(input: {
  project: ProjectShellProject;
  liveProjects: ReadonlyArray<Project>;
}): {
  resolvedProjectId: string;
  pinnedProjectIds: ReadonlySet<string>;
} {
  const resolvedProjectId = resolveStoredProjectId(
    input.project.id,
    loadStoredProjects(),
    input.liveProjects,
  );

  return {
    resolvedProjectId,
    pinnedProjectIds: new Set(
      [
        input.project.id,
        resolvedProjectId,
        resolveCanonicalProjectId(input.project, input.liveProjects),
      ].filter(
        (projectId): projectId is string => typeof projectId === "string" && projectId.length > 0,
      ),
    ),
  };
}

export function buildTicketPathPinnedSidebarItemIds(input: {
  projectId: string;
  ticketId: string;
  parentByChildId: ReadonlyMap<string, string>;
}): string[] {
  const ancestorIds: string[] = [];
  let parentId = input.parentByChildId.get(input.ticketId);
  while (parentId) {
    ancestorIds.unshift(
      buildTicketSidebarPinnedItemId({ projectId: input.projectId, ticketId: parentId }),
    );
    parentId = input.parentByChildId.get(parentId);
  }

  return [
    ...ancestorIds,
    buildTicketSidebarPinnedItemId({ projectId: input.projectId, ticketId: input.ticketId }),
  ];
}

export function buildTicketSubtreePinnedSidebarItemIds(input: {
  projectId: string;
  rootTicketId: string;
  childrenByParentId: ReadonlyMap<string, readonly ProjectTicket[]>;
}): string[] {
  const itemIds: string[] = [];

  const visit = (ticketId: string) => {
    itemIds.push(buildTicketSidebarPinnedItemId({ projectId: input.projectId, ticketId }));
    for (const child of input.childrenByParentId.get(ticketId) ?? []) {
      visit(child.id);
    }
  };

  visit(input.rootTicketId);
  return itemIds;
}

export function findPinnedTicketSidebarItem(
  pinnedSidebarItems: ReadonlyArray<T3WorkSidebarPinnedItem>,
  projectIds: ReadonlySet<string>,
  ticketId: string,
): Extract<T3WorkSidebarPinnedItem, { kind: "jira-work-item" }> | null {
  for (const item of pinnedSidebarItems) {
    if (
      item.kind === "jira-work-item" &&
      item.ticketId === ticketId &&
      projectIds.has(item.projectId)
    ) {
      return item;
    }
  }

  return null;
}

export function findPinnedGitHubActivitySidebarItem(
  pinnedSidebarItems: ReadonlyArray<T3WorkSidebarPinnedItem>,
  projectIds: ReadonlySet<string>,
  activityId: string,
): Extract<T3WorkSidebarPinnedItem, { kind: "github-activity" }> | null {
  for (const item of pinnedSidebarItems) {
    if (
      item.kind === "github-activity" &&
      item.activityId === activityId &&
      projectIds.has(item.projectId)
    ) {
      return item;
    }
  }

  return null;
}

export function findPinnedTicketSubtreeItemIds(input: {
  rootTicketId: string;
  projectIds: ReadonlySet<string>;
  pinnedSidebarItems: ReadonlyArray<T3WorkSidebarPinnedItem>;
  childrenByParentId: ReadonlyMap<string, readonly ProjectTicket[]>;
}): string[] {
  const itemIds: string[] = [];

  const visit = (ticketId: string) => {
    for (const item of input.pinnedSidebarItems) {
      if (
        item.kind === "jira-work-item" &&
        item.ticketId === ticketId &&
        input.projectIds.has(item.projectId)
      ) {
        itemIds.push(item.id);
      }
    }

    for (const child of input.childrenByParentId.get(ticketId) ?? []) {
      visit(child.id);
    }
  };

  visit(input.rootTicketId);
  return [...new Set(itemIds)];
}
