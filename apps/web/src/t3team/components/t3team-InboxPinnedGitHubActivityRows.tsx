import { useMemo } from "react";

import type { ProjectShellProject } from "@t3tools/project-context";
import { useProjectStore } from "~/t3team/hooks/t3team-useProjectStore";
import { readLinkedRepositoryUrlsFromProject } from "~/t3team/hooks/t3team-createProjectBootstrap";
import { useProjectGitHubActivity } from "~/t3team/hooks/t3team-useProjectGitHubActivity";
import { useTicketAgentContext } from "~/t3team/hooks/t3team-useTicketAgentContext";
import type { InboxGitHubActivityPinRow } from "~/t3team/t3team-inboxWorkItems";
import type { ProjectTicket } from "~/t3team/t3team-types";

import { PinnedGitHubActivityRow } from "./t3team-ProjectSidebarPinnedTicketRows";
import { buildGitHubActivityByIdLookup } from "./t3team-useProjectSidebarPinnedItems";

/**
 * Pinned GitHub-activity rows inside upstream's Inbox stream (Work lens counterpart to
 * `ProjectSidebarPinnedItems`'s GitHub rows in the Code lens — see t3team-useInboxWorkItems.ts
 * for why the Work lens needs its own path here rather than sharing that component directly).
 *
 * Grouped by project, one live-activity fetch (`useProjectGitHubActivity`) per project rather
 * than per pinned row, mirroring how `InboxWorkItemRows` resolves one ticket list per project
 * instead of per row.
 */
export function InboxPinnedGitHubActivityRows({
  rows,
}: {
  rows: ReadonlyArray<InboxGitHubActivityPinRow>;
}) {
  const { allProjects, getTicketsForProject } = useProjectStore();

  const projectsById = useMemo(
    () => new Map<string, ProjectShellProject>(allProjects.map((project) => [project.id, project])),
    [allProjects],
  );

  const rowsByProjectId = useMemo(() => {
    const groups = new Map<string, InboxGitHubActivityPinRow[]>();
    for (const row of rows) {
      const bucket = groups.get(row.projectId) ?? [];
      bucket.push(row);
      groups.set(row.projectId, bucket);
    }
    return groups;
  }, [rows]);

  return (
    <>
      {[...rowsByProjectId.entries()].map(([projectId, projectRows]) => {
        const project = projectsById.get(projectId);
        if (!project) {
          return null;
        }
        return (
          <InboxPinnedGitHubActivityProjectGroup
            key={projectId}
            project={project}
            rows={projectRows}
            projectTickets={getTicketsForProject(project.id)}
          />
        );
      })}
    </>
  );
}

function InboxPinnedGitHubActivityProjectGroup({
  project,
  rows,
  projectTickets,
}: {
  project: ProjectShellProject;
  rows: ReadonlyArray<InboxGitHubActivityPinRow>;
  projectTickets: ReadonlyArray<ProjectTicket>;
}) {
  const linkedRepositoryUrls = useMemo(
    () => readLinkedRepositoryUrlsFromProject(project),
    [project],
  );
  // The Code lens only fetches while a project row is expanded (`useProjectSidebarProjectRow`);
  // a pinned row must stay visible regardless of that, so this fetch is unconditionally enabled.
  const { activityByWorkItem, unlinkedActivityItems } = useProjectGitHubActivity({
    project,
    linkedRepositoryUrls,
    enabled: true,
  });
  const { getGitHubActivityAgentContext, openGitHubActivityAgentContextMenu } =
    useTicketAgentContext({
      project,
      projectTickets,
      githubActivityByWorkItem: activityByWorkItem,
    });

  const githubActivityById = useMemo(
    () =>
      buildGitHubActivityByIdLookup({
        githubActivityByWorkItem: activityByWorkItem,
        unlinkedGitHubActivityItems: unlinkedActivityItems,
        projectTickets,
      }),
    [activityByWorkItem, projectTickets, unlinkedActivityItems],
  );

  return (
    <>
      {rows.map((row) => {
        const resolved = githubActivityById.get(row.activityId);
        // The activity fell out of the polling window (merged/closed and aged out, or the cache
        // hasn't warmed yet for this project) — it stays pinned in the store, but there is
        // nothing to render until it resolves again, same as an unresolved ticket pin staying
        // silent rather than showing a broken row.
        if (!resolved) {
          return null;
        }
        const { item, linkedWorkItem } = resolved;

        return (
          <PinnedGitHubActivityRow
            key={row.id}
            item={item}
            state={{ isSelected: false, isOpen: false }}
            onContextMenu={(event) => {
              openGitHubActivityAgentContextMenu(event, linkedWorkItem, item, {
                visibleInSidebar: true,
              });
            }}
            getItemDragCapabilities={(activity) =>
              getGitHubActivityAgentContext(linkedWorkItem, activity, {
                visibleInSidebar: true,
              })
            }
          />
        );
      })}
    </>
  );
}
