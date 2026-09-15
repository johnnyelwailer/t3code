/**
 * The digest lens body for the per-project My Work view: reads the server-aggregated
 * `DigestGraph` for this project, derives the heuristic plan from it, and renders
 * `ProjectMyWorkDigestView`. Extracted from `ProjectMyWorkContent` so that file stays inside
 * the t3team additive line cap.
 */
import { useMemo } from "react";

import { useNowMinute } from "~/hooks/useNowMinute";

import { T3SurfacePanel } from "~/t3team/components/ui/t3team-surface";
import { useMyWorkDigestGraph } from "~/t3team/mywork-digest/t3team-useMyWorkDigestGraph";
import { ProjectMyWorkDigestView } from "~/t3team/t3team-ProjectMyWorkDigestView";
import { useT3TeamBetaFlags } from "~/t3team/t3team-betaFlags";
import { ProjectMyWorkLoadingState } from "~/t3team/t3team-projectMyWorkContentState";
import {
  buildHeuristicDigestPlan,
  resolveDigestPlan,
} from "~/t3team/t3team-projectMyWorkDigestPlan";
import type { ProjectShellProject } from "@t3tools/project-context";

// TODO(digest-nav): rows navigate to the ticket URL today; thread an in-app onOpenTicket through
// ProjectMyWorkDigestView -> DigestStoryGroup/DigestRow once the Storybook cut settles.
export function ProjectMyWorkDigestContent({ project }: { project: ProjectShellProject }) {
  const { flags } = useT3TeamBetaFlags();
  const projects = useMemo(() => [project], [project]);
  const { graph, status, error } = useMyWorkDigestGraph({ projects, scope: "project" });
  // Minute-granular clock shared with the rest of the app: stable within a render, re-plans on tick.
  const nowMs = Date.parse(useNowMinute());
  const plan = useMemo(() => {
    if (!graph) {
      return null;
    }
    return resolveDigestPlan(buildHeuristicDigestPlan(graph, nowMs), graph, nowMs);
  }, [graph, nowMs]);

  if (status === "loading" && !graph) {
    return <ProjectMyWorkLoadingState />;
  }
  if (status === "error") {
    return (
      <T3SurfacePanel tone="dashed" className="px-4 py-8 text-sm text-muted-foreground">
        Could not load the digest view.
        {error ? <span className="block pt-1 text-xs opacity-80">{error}</span> : null}
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
      nowMs={nowMs}
      burndownVariant={flags.digestBurndownVariant}
    />
  );
}
