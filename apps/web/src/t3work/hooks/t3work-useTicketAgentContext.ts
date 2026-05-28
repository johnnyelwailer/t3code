import { useCallback, useMemo } from "react";
import type { ProjectShellProject } from "@t3tools/project-context";
import { useShallow } from "zustand/react/shallow";

import { selectProjectsAcrossEnvironments, useStore } from "~/store";
import { useBackend } from "~/t3work/backend/t3work-index";
import { useAgentContext } from "~/t3work/hooks/t3work-useAgentContext";
import { useT3WorkPinnedSidebarStore } from "~/t3work/t3work-pinnedSidebarStore";
import type { GitHubWorkActivityItem } from "~/t3work/t3work-githubActivity";
import { buildProjectTicketHierarchy } from "~/t3work/t3work-ticketHierarchy";
import {
  buildGitHubActivitySidebarPinnedItem,
  buildTicketSidebarPinnedItem,
} from "~/t3work/t3work-sidebarPinningTypes";
import {
  buildGitHubActivityAgentContextCapabilities,
  buildTicketAgentContextCapabilities,
} from "~/t3work/t3work-ticketAgentContext";
import type { ProjectTicket } from "~/t3work/t3work-types";
import { useTicketAgentContextMenus } from "~/t3work/hooks/t3work-useTicketAgentContextMenus";
import {
  buildTicketPathPinnedSidebarItemIds,
  buildTicketSubtreePinnedSidebarItemIds,
  findPinnedGitHubActivitySidebarItem,
  findPinnedTicketSidebarItem,
  findPinnedTicketSubtreeItemIds,
  resolveTicketAgentContextPinnedProjectState,
} from "./t3work-ticketSidebarPinState";

const emptyGitHubActivityByWorkItem = new Map<string, readonly GitHubWorkActivityItem[]>();

export function useTicketAgentContext(input: {
  project: ProjectShellProject;
  projectTickets: ReadonlyArray<ProjectTicket>;
  githubActivityByWorkItem?: ReadonlyMap<string, ReadonlyArray<GitHubWorkActivityItem>>;
}) {
  const {
    project,
    projectTickets,
    githubActivityByWorkItem = emptyGitHubActivityByWorkItem,
  } = input;
  const backend = useBackend();
  const { showAgentContextMenu, showAgentContextMenuAt } = useAgentContext();
  const pinnedSidebarItems = useT3WorkPinnedSidebarStore((state) => state.items);
  const liveProjects = useStore(useShallow(selectProjectsAcrossEnvironments));
  const { resolvedProjectId, pinnedProjectIds } = useMemo(
    () => resolveTicketAgentContextPinnedProjectState({ project, liveProjects }),
    [liveProjects, project],
  );
  const ticketHierarchy = useMemo(
    () => buildProjectTicketHierarchy(projectTickets),
    [projectTickets],
  );

  const getTicketAgentContext = useCallback(
    (ticket: ProjectTicket, options?: { visibleInSidebar?: boolean }) => {
      if (!backend) {
        return null;
      }

      const existingPinnedItem = findPinnedTicketSidebarItem(
        pinnedSidebarItems,
        pinnedProjectIds,
        ticket.id,
      );
      const sidebarPinItem =
        existingPinnedItem ??
        buildTicketSidebarPinnedItem({
          projectId: resolvedProjectId,
          ticketId: ticket.id,
        });
      const prioritizeItemIds = buildTicketPathPinnedSidebarItemIds({
        projectId: resolvedProjectId,
        ticketId: ticket.id,
        parentByChildId: ticketHierarchy.parentByChildId,
      });
      const cascadeItemIds = existingPinnedItem
        ? findPinnedTicketSubtreeItemIds({
            rootTicketId: ticket.id,
            projectIds: pinnedProjectIds,
            pinnedSidebarItems,
            childrenByParentId: ticketHierarchy.childrenByParentId,
          })
        : buildTicketSubtreePinnedSidebarItemIds({
            projectId: resolvedProjectId,
            rootTicketId: ticket.id,
            childrenByParentId: ticketHierarchy.childrenByParentId,
          });

      return buildTicketAgentContextCapabilities(
        {
          backend,
          project,
          ticket,
          projectTickets,
          githubActivityItems: githubActivityByWorkItem.get(ticket.ref.displayId) ?? [],
        },
        {
          sidebarPin: {
            item: sidebarPinItem,
            pinned: existingPinnedItem !== null,
            prioritizeItemIds,
            cascadeItemIds,
            ...(options?.visibleInSidebar ? { visibleInSidebar: true } : {}),
          },
        },
      );
    },
    [
      backend,
      githubActivityByWorkItem,
      pinnedProjectIds,
      pinnedSidebarItems,
      project,
      projectTickets,
      resolvedProjectId,
      ticketHierarchy.childrenByParentId,
    ],
  );

  const getGitHubActivityAgentContext = useCallback(
    (
      ticket: ProjectTicket | null,
      item: GitHubWorkActivityItem,
      options?: { fallbackHost?: string; visibleInSidebar?: boolean },
    ) => {
      const existingPinnedItem = findPinnedGitHubActivitySidebarItem(
        pinnedSidebarItems,
        pinnedProjectIds,
        item.id,
      );
      const sidebarPinItem =
        existingPinnedItem ??
        buildGitHubActivitySidebarPinnedItem({
          projectId: resolvedProjectId,
          activityId: item.id,
        });
      const prioritizeItemIds = ticket
        ? buildTicketPathPinnedSidebarItemIds({
            projectId: resolvedProjectId,
            ticketId: ticket.id,
            parentByChildId: ticketHierarchy.parentByChildId,
          })
        : undefined;

      return buildGitHubActivityAgentContextCapabilities(
        {
          backend,
          project,
          item,
          linkedWorkItem: ticket,
          ...(ticket
            ? {
                projectTickets,
                githubActivityItems: githubActivityByWorkItem.get(ticket.ref.displayId) ?? [],
              }
            : {}),
          ...(options?.fallbackHost ? { fallbackHost: options.fallbackHost } : {}),
        },
        {
          sidebarPin: {
            item: sidebarPinItem,
            pinned: existingPinnedItem !== null,
            ...(prioritizeItemIds ? { prioritizeItemIds } : {}),
            ...(options?.visibleInSidebar ? { visibleInSidebar: true } : {}),
          },
        },
      );
    },
    [
      backend,
      githubActivityByWorkItem,
      pinnedProjectIds,
      pinnedSidebarItems,
      project,
      projectTickets,
      resolvedProjectId,
      ticketHierarchy.parentByChildId,
    ],
  );

  const {
    openTicketAgentContextMenu,
    openTicketAgentContextMenuAt,
    openGitHubActivityAgentContextMenu,
  } = useTicketAgentContextMenus({
    getTicketAgentContext,
    getGitHubActivityAgentContext,
    showAgentContextMenu,
    showAgentContextMenuAt,
  });

  return {
    getTicketAgentContext,
    getGitHubActivityAgentContext,
    openTicketAgentContextMenu,
    openTicketAgentContextMenuAt,
    openGitHubActivityAgentContextMenu,
  };
}
