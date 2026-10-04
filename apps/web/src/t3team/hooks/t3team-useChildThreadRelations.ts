import { useEffect, useMemo, useRef } from "react";
import { normalizeGitRemoteUrl } from "@t3tools/shared/git";

import { useT3TeamSidebarProjectScope } from "~/t3team/t3team-sidebarProjectScopeStore";
import { useT3TeamSidebarThreadDataStore } from "~/t3team/t3team-sidebarThreadDataStore";
import type { ProjectTicket } from "~/t3team/t3team-types";
import {
  createChildThreadRelationsMemo,
  type ChildThreadRelations,
  type SubRunCounts,
} from "./t3team-childThreadRelationsCore";
import { readLinkedRepositoryUrlsFromProject } from "./t3team-createProjectBootstrap";
import { useProjectStore } from "./t3team-useProjectStore";

export type { ChildThreadRelations, SubRunCounts };
export {
  buildChildThreadRelations,
  buildAttributionByThreadId,
  computeChildThreadRelationsSignature,
  createChildThreadRelationsMemo,
  EMPTY_ATTRIBUTION_MAP,
} from "./t3team-childThreadRelationsCore";

/**
 * React binding for `buildChildThreadRelations`. Calls `useProjectStore()`
 * independently — the same pattern `t3team-useInboxWorkItems.ts` already uses to
 * read Team thread/project state from inside upstream's Inbox sidebar without
 * prop-drilling it down from `t3team-App.tsx`.
 *
 * Kept referentially stable via `createChildThreadRelationsMemo` — see that
 * function's comment for why (upstream's Sidebar.tsx depends on the result
 * in a `useMemo`, and array-identity churn there caused a visible sidebar
 * reflow on every thread selection).
 *
 * @deprecated Prefer `useT3TeamSidebarThreadMeta` which also populates the
 * `t3team-sidebarThreadDataStore` so per-row slots don't need their own
 * `useProjectStore` subscriptions.
 */
export function useT3TeamChildThreadRelations(): ChildThreadRelations {
  const { threads } = useProjectStore();
  const memoRef = useRef<ReturnType<typeof createChildThreadRelationsMemo> | null>(null);
  if (!memoRef.current) {
    memoRef.current = createChildThreadRelationsMemo();
  }
  return memoRef.current(threads, EMPTY_TICKETS_MAP).relations;
}

const EMPTY_TICKETS_MAP: ReadonlyMap<string, ProjectTicket> = new Map();

/**
 * Unified hook for `Sidebar.tsx`: one `useProjectStore()` call that computes
 * `ChildThreadRelations` AND `attributionByThreadId` in a single pass, then
 * mirrors both to `t3team-sidebarThreadDataStore` so per-row slots
 * (`InboxSubRunsChip`, `InboxThreadAttribution`) can read their entry with a
 * narrow Zustand selector — no `useProjectStore` per row, memo boundaries intact.
 *
 * Drop-in replacement for `useT3TeamChildThreadRelations` in `Sidebar.tsx`.
 * Returns the same `ChildThreadRelations` shape; the attribution side-effect is
 * handled internally via `useEffect` to keep the write outside the render phase.
 */
export function useT3TeamSidebarThreadMeta(): ChildThreadRelations {
  const { threads, allProjects, getTicketsForProject } = useProjectStore();
  const setAttributionByThreadId = useT3TeamSidebarThreadDataStore(
    (s) => s.setAttributionByThreadId,
  );
  const setSubRunCountsByParentId = useT3TeamSidebarThreadDataStore(
    (s) => s.setSubRunCountsByParentId,
  );

  const memoRef = useRef<ReturnType<typeof createChildThreadRelationsMemo> | null>(null);
  if (!memoRef.current) {
    memoRef.current = createChildThreadRelationsMemo();
  }

  // Build tickets map from existing project store data — same derivation as
  // useTicketsById() in t3team-useInboxWorkItems.ts, but inline to avoid a
  // second useProjectStore() subscription.
  const ticketsByIdRef = useRef<ReadonlyMap<string, ProjectTicket>>(new Map());
  const allProjectsRef = useRef(allProjects);
  const getTicketsForProjectRef = useRef(getTicketsForProject);
  // Only recompute when allProjects/getTicketsForProject identity changes so
  // we don't rebuild the Map on every thread-click.
  if (
    allProjectsRef.current !== allProjects ||
    getTicketsForProjectRef.current !== getTicketsForProject
  ) {
    allProjectsRef.current = allProjects;
    getTicketsForProjectRef.current = getTicketsForProject;
    ticketsByIdRef.current = new Map(
      allProjects
        .flatMap((project) => getTicketsForProject(project.id))
        .map((ticket) => [ticket.id, ticket]),
    );
  }

  const { relations, attributionByThreadId } = memoRef.current(threads, ticketsByIdRef.current);

  // Mirror to the thread-data store outside the render phase.
  useEffect(() => {
    setAttributionByThreadId(attributionByThreadId);
  }, [attributionByThreadId, setAttributionByThreadId]);

  useEffect(() => {
    setSubRunCountsByParentId(relations.subRunCountsByParentId);
  }, [relations.subRunCountsByParentId, setSubRunCountsByParentId]);

  // Mirror each work-source project's linked repositories (as normalized remote keys) for the
  // pull request route's sidebar-scope narrowing — same single-store rule as the maps above.
  const setLinkedRepositoryKeysByProjectId = useT3TeamSidebarProjectScope(
    (s) => s.setLinkedRepositoryKeysByProjectId,
  );
  const linkedRepositoryKeysByProjectId = useMemo(() => {
    const keysByProjectId = new Map<string, ReadonlyArray<string>>();
    for (const project of allProjects) {
      const urls = readLinkedRepositoryUrlsFromProject(project);
      if (urls.length > 0) keysByProjectId.set(project.id, urls.map(normalizeGitRemoteUrl));
    }
    return keysByProjectId;
  }, [allProjects]);
  useEffect(() => {
    setLinkedRepositoryKeysByProjectId(linkedRepositoryKeysByProjectId);
  }, [linkedRepositoryKeysByProjectId, setLinkedRepositoryKeysByProjectId]);

  return relations;
}
