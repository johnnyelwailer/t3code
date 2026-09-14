/**
 * The digest lens body for the per-project My Work view: reads the server-aggregated
 * `DigestGraph` for this project, derives the heuristic plan from it, and renders
 * `ProjectMyWorkDigestView`. Extracted from `ProjectMyWorkContent` so that file stays inside
 * the t3team additive line cap.
 */
import { useMemo } from "react";

import { T3SurfacePanel } from "~/t3team/components/ui/t3team-surface";
import { useMyWorkDigestGraph } from "~/t3team/mywork-digest/t3team-useMyWorkDigestGraph";
import { ProjectMyWorkDigestView } from "~/t3team/t3team-ProjectMyWorkDigestView";
import { ProjectMyWorkLoadingState } from "~/t3team/t3team-projectMyWorkContentState";
import {
  buildHeuristicDigestPlan,
  resolveDigestPlan,
} from "~/t3team/t3team-projectMyWorkDigestPlan";
import type { ProjectShellProject } from "@t3tools/project-context";

// TODO(digest-nav): rows navigate to the ticket URL today; thread an in-app onOpenTicket through
// ProjectMyWorkDigestView -> DigestStoryGroup/DigestRow once the Storybook cut settles.
export function ProjectMyWorkDigestContent({ project }: { project: ProjectShellProject }) {
  const projects = useMemo(() => [project], [project]);
  const { graph, status } = useMyWorkDigestGraph({ projects, scope: "project" });
  const plan = useMemo(() => {
    if (!graph) {
      return null;
    }
    const nowMs = Date.now();
    return resolveDigestPlan(buildHeuristicDigestPlan(graph, nowMs), graph, nowMs);
  }, [graph]);

  if (status === "loading" && !graph) {
    return <ProjectMyWorkLoadingState />;
  }
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
  return <ProjectMyWorkDigestView plan={plan} graph={graph} nowMs={Date.now()} />;
}
