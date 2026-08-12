import { useMemo } from "react";
import type { ProjectShellProject } from "@t3tools/project-context";

import { useProjects } from "~/state/entities";
import type { Project } from "~/types";
import { loadStoredProjects } from "~/t3team/hooks/t3team-projectStoreUtils";
import {
  resolveCanonicalProjectId,
  resolveStoredProjectId,
} from "~/t3team/hooks/t3team-threadBridge";
import { useT3TeamPinnedSidebarStore } from "~/t3team/t3team-pinnedSidebarStore";
import type { GitHubWorkActivityItem } from "~/t3team/t3team-githubActivity";
import type { T3TeamSidebarPinnedItem } from "~/t3team/t3team-sidebarPinningTypes";
import { buildProjectTicketLookup } from "~/t3team/t3team-ticketLookup";
import type { ProjectThread, ProjectTicket } from "~/t3team/t3team-types";
import {
  buildPinnedTicketThreadFallbacks,
  type SidebarPinnedTicketThreadFallback,
} from "./t3team-projectSidebarItemState";

export type ResolvedPinnedSidebarItem =
  | {
      kind: "jira-work-item";
      pinnedItem: Extract<T3TeamSidebarPinnedItem, { kind: "jira-work-item" }>;
      ticket: ProjectTicket;
      ticketThreads: readonly ProjectThread[];
    }
  | {
      kind: "jira-work-item-unresolved";
      pinnedItem: Extract<T3TeamSidebarPinnedItem, { kind: "jira-work-item" }>;
      ticketId: string;
      ticketDisplayId: string;
      title: string;
      ticketThreads: readonly ProjectThread[];
    }
  | {
      kind: "github-activity";
      pinnedItem: Extract<T3TeamSidebarPinnedItem, { kind: "github-activity" }>;
      item: GitHubWorkActivityItem;
      linkedWorkItem: ProjectTicket | null;
    };

export type ResolvedGitHubActivityById = ReadonlyMap<
  string,
  { item: GitHubWorkActivityItem; linkedWorkItem: ProjectTicket | null }
>;

/**
 * Maps a project's raw GitHub-activity feed to the shape pinned rows need: activity id ->
 * `{ item, linkedWorkItem }`. Shared with the Work-lens Inbox (`t3team-InboxPinnedGitHubActivityRows.tsx`),
 * which resolves the same pinned-activity-id -> row lookup per project rather than per pinned item.
 */
export function buildGitHubActivityByIdLookup(input: {
  githubActivityByWorkItem: ReadonlyMap<string, ReadonlyArray<GitHubWorkActivityItem>>;
  unlinkedGitHubActivityItems: ReadonlyArray<GitHubWorkActivityItem>;
  projectTickets: ReadonlyArray<ProjectTicket>;
}): ResolvedGitHubActivityById {
  const resolvedItems = new Map<
    string,
    { item: GitHubWorkActivityItem; linkedWorkItem: ProjectTicket | null }
  >();

  for (const item of input.unlinkedGitHubActivityItems) {
    resolvedItems.set(item.id, { item, linkedWorkItem: null });
  }

  for (const ticket of input.projectTickets) {
    for (const item of input.githubActivityByWorkItem.get(ticket.ref.displayId) ?? []) {
      resolvedItems.set(item.id, { item, linkedWorkItem: ticket });
    }
  }

  return resolvedItems;
}

export function resolveProjectSidebarPinnedProjectIds(input: {
  project: ProjectShellProject;
  storedProjects: ReadonlyArray<ProjectShellProject>;
  liveProjects: ReadonlyArray<Project>;
}): readonly string[] {
  return [
    ...new Set(
      [
        input.project.id,
        resolveStoredProjectId(input.project.id, input.storedProjects, input.liveProjects),
        resolveCanonicalProjectId(input.project, input.liveProjects),
      ].filter(
        (projectId): projectId is string => typeof projectId === "string" && projectId.length > 0,
      ),
    ),
  ];
}

export function resolveProjectSidebarPinnedItems(input: {
  projectId: string;
  projectIdAliases?: ReadonlyArray<string>;
  pinnedSidebarItems: ReadonlyArray<T3TeamSidebarPinnedItem>;
  ticketLookup: ReadonlyMap<string, ProjectTicket>;
  ticketThreadsById: ReadonlyMap<string, SidebarPinnedTicketThreadFallback>;
  githubActivityById: ResolvedGitHubActivityById;
}): ResolvedPinnedSidebarItem[] {
  const resolvedItems: ResolvedPinnedSidebarItem[] = [];
  const resolvedEntityKeys = new Set<string>();
  const matchingProjectIds = new Set([input.projectId, ...(input.projectIdAliases ?? [])]);

  for (const pinnedItem of input.pinnedSidebarItems) {
    if (!matchingProjectIds.has(pinnedItem.projectId)) {
      continue;
    }

    const entityKey =
      pinnedItem.kind === "jira-work-item"
        ? `jira-work-item:${pinnedItem.ticketId}`
        : `github-activity:${pinnedItem.activityId}`;
    if (resolvedEntityKeys.has(entityKey)) {
      continue;
    }

    if (pinnedItem.kind === "jira-work-item") {
      const ticket = input.ticketLookup.get(pinnedItem.ticketId);
      const ticketThreads = input.ticketThreadsById.get(pinnedItem.ticketId)?.ticketThreads ?? [];
      if (ticket) {
        resolvedItems.push({ kind: "jira-work-item", pinnedItem, ticket, ticketThreads });
        resolvedEntityKeys.add(entityKey);
        continue;
      }

      const fallback = input.ticketThreadsById.get(pinnedItem.ticketId);
      if (fallback) {
        resolvedItems.push({
          kind: "jira-work-item-unresolved",
          pinnedItem,
          ticketId: fallback.ticketId,
          ticketDisplayId: fallback.ticketDisplayId,
          title: fallback.title,
          ticketThreads: fallback.ticketThreads,
        });
        resolvedEntityKeys.add(entityKey);
      }
      continue;
    }

    const githubActivity = input.githubActivityById.get(pinnedItem.activityId);
    if (githubActivity) {
      resolvedItems.push({
        kind: "github-activity",
        pinnedItem,
        item: githubActivity.item,
        linkedWorkItem: githubActivity.linkedWorkItem,
      });
      resolvedEntityKeys.add(entityKey);
    }
  }

  return resolvedItems;
}

export function useProjectSidebarPinnedItems(input: {
  project: ProjectShellProject;
  projectTickets: ReadonlyArray<ProjectTicket>;
  projectThreads: ReadonlyArray<ProjectThread>;
  githubActivityByWorkItem: ReadonlyMap<string, ReadonlyArray<GitHubWorkActivityItem>>;
  unlinkedGitHubActivityItems: ReadonlyArray<GitHubWorkActivityItem>;
}) {
  const {
    project,
    projectTickets,
    projectThreads,
    githubActivityByWorkItem,
    unlinkedGitHubActivityItems,
  } = input;
  const pinnedSidebarItems = useT3TeamPinnedSidebarStore((state) => state.items);
  const liveProjects = useProjects();

  const ticketLookup = useMemo(() => buildProjectTicketLookup(projectTickets), [projectTickets]);
  const ticketThreadsById = useMemo(
    () => buildPinnedTicketThreadFallbacks(projectThreads, ticketLookup),
    [projectThreads, ticketLookup],
  );
  const projectIdAliases = useMemo(
    () =>
      resolveProjectSidebarPinnedProjectIds({
        project,
        storedProjects: loadStoredProjects(),
        liveProjects,
      }).filter((projectId) => projectId !== project.id),
    [liveProjects, project],
  );
  const githubActivityById = useMemo(
    () =>
      buildGitHubActivityByIdLookup({
        githubActivityByWorkItem,
        unlinkedGitHubActivityItems,
        projectTickets,
      }),
    [githubActivityByWorkItem, projectTickets, unlinkedGitHubActivityItems],
  );

  return useMemo<ResolvedPinnedSidebarItem[]>(
    () =>
      resolveProjectSidebarPinnedItems({
        projectId: project.id,
        projectIdAliases,
        pinnedSidebarItems,
        ticketLookup,
        ticketThreadsById,
        githubActivityById,
      }),
    [
      githubActivityById,
      pinnedSidebarItems,
      project.id,
      projectIdAliases,
      ticketLookup,
      ticketThreadsById,
    ],
  );
}
