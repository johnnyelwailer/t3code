/**
 * The digest lens body for the per-project My Work view: adapts what the view already has
 * (fetched tickets + GitHub activity) into a `DigestGraph`, derives the heuristic plan from it,
 * and renders `ProjectMyWorkDigestView`. Extracted from `ProjectMyWorkContent` so that file
 * stays inside the t3team additive line cap.
 */
import { useMemo } from "react";

import { T3SurfacePanel } from "~/t3team/components/ui/t3team-surface";
import { useMyWorkDigestGraph } from "~/t3team/mywork-digest/t3team-useMyWorkDigestGraph";
import { ProjectMyWorkDigestView } from "~/t3team/t3team-ProjectMyWorkDigestView";
import {
  buildHeuristicDigestPlan,
  resolveDigestPlan,
} from "~/t3team/t3team-projectMyWorkDigestPlan";
import type { GitHubWorkActivityItem } from "~/t3team/t3team-githubActivity";
import type { ProjectTicket } from "~/t3team/t3team-types";
import type { ProjectShellProject } from "@t3tools/project-context";

export function ProjectMyWorkDigestContent({
  project,
  tickets,
  githubActivityByWorkItem,
  onOpenTicket,
}: {
  project: ProjectShellProject;
  tickets: readonly ProjectTicket[];
  githubActivityByWorkItem: ReadonlyMap<string, ReadonlyArray<GitHubWorkActivityItem>>;
  onOpenTicket: (projectId: string, ticketId: string) => void;
}) {
  const githubActivity = useMemo(
    () => [...githubActivityByWorkItem.values()].flat(),
    [githubActivityByWorkItem],
  );
  // TODO(digest-data): viewerName/sprint are not wired to real sources yet.
  const { graph, status } = useMyWorkDigestGraph({
    scope: "project",
    projectId: project.id,
    tickets,
    githubActivity,
  });
  const plan = useMemo(() => {
    if (!graph) {
      return null;
    }
    const nowMs = Date.now();
    return resolveDigestPlan(buildHeuristicDigestPlan(graph, nowMs), graph, nowMs);
  }, [graph]);

  if (status === "error") {
    return (
      <T3SurfacePanel tone="dashed" className="px-4 py-8 text-sm text-muted-foreground">
        Could not load the digest view.
      </T3SurfacePanel>
    );
  }
  if (!graph || !plan) {
    return (
      <T3SurfacePanel tone="dashed" className="px-4 py-8 text-sm text-muted-foreground">
        Nothing needs you
      </T3SurfacePanel>
    );
  }
  return (
    <ProjectMyWorkDigestView
      plan={plan}
      graph={graph}
      nowMs={Date.now()}
      onOpenTicket={(ticketId) => onOpenTicket(project.id, ticketId)}
    />
  );
}
