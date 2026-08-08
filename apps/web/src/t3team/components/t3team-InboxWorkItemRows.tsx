import { useMemo } from "react";

import type { ProjectShellProject } from "@t3tools/project-context";
import { useProjectStore } from "~/t3team/hooks/t3team-useProjectStore";
import type { InboxWorkItemRow as InboxWorkItemRowData } from "~/t3team/t3team-inboxWorkItems";
import { buildTicketSidebarPinnedItemId } from "~/t3team/t3team-sidebarPinningTypes";

import { InboxWorkItemRow } from "./t3team-InboxWorkItemRow";

/**
 * Work-item rows inside upstream's Inbox stream.
 *
 * Deliberately distinct from a thread card but built from the same sidebar
 * tokens, so they read as native Inbox entries rather than a project-management
 * tree grafted on top (doc 40).
 *
 * Ordering is whatever `selectInboxWorkItems` produced — activity order, then the user's own
 * "show at top" arrangement. The rows are NOT regrouped by project here: doing so would hoist the
 * per-project hook out of the row but reorder a stream whose whole point is recency.
 */
export function InboxWorkItemRows({ rows }: { rows: ReadonlyArray<InboxWorkItemRowData> }) {
  const { allProjects, getTicketsForProject } = useProjectStore();

  // Keyed by plain string: row ids come from the ticket model, which does not carry the
  // `ProjectShellProjectId` brand. Looking the project up here is also what recovers the branded
  // id for `getTicketsForProject`.
  const projectsById = useMemo(
    () => new Map<string, ProjectShellProject>(allProjects.map((project) => [project.id, project])),
    [allProjects],
  );

  // `getTicketsForProject` filters into a NEW array on every call, and each row calls the ticket
  // agent-context hook — which memoizes its hierarchy on that array's identity. Resolving each
  // project's list once here, memoized, keeps that hierarchy stable instead of rebuilding it per
  // row per render.
  const ticketsByProjectId = useMemo(
    () =>
      new Map(
        allProjects.map((project) => [project.id as string, getTicketsForProject(project.id)]),
      ),
    [allProjects, getTicketsForProject],
  );

  // Drag-to-reorder moves an item within its own project's stored order, matching the Code lens.
  // The scope is therefore the sibling rows from the same project, not the whole stream.
  const scopeItemIdsByProjectId = useMemo(() => {
    const scopes = new Map<string, string[]>();
    for (const row of rows) {
      const bucket = scopes.get(row.projectId) ?? [];
      bucket.push(
        buildTicketSidebarPinnedItemId({ projectId: row.projectId, ticketId: row.ticketId }),
      );
      scopes.set(row.projectId, bucket);
    }
    return scopes;
  }, [rows]);

  return (
    <>
      {rows.map((row) => {
        const project = projectsById.get(row.projectId);
        if (!project) {
          return null;
        }
        return (
          <InboxWorkItemRow
            key={row.ticketId}
            row={row}
            project={project}
            projectTickets={ticketsByProjectId.get(row.projectId) ?? []}
            scopeItemIds={scopeItemIdsByProjectId.get(row.projectId) ?? []}
          />
        );
      })}
    </>
  );
}
