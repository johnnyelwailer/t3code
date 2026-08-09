import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { ProjectShellProject } from "@t3tools/project-context";

import { Button } from "~/t3team/components/ui/t3team-button";
import { T3SurfaceCard, T3SurfaceCardContent } from "~/t3team/components/ui/t3team-surface";
import { projectBindingState } from "~/t3team/t3team-projectSourceBinding";
import { RepairProjectBindingDialog } from "~/t3team/t3team-RepairProjectBindingDialog";

/**
 * ONE clear entry point for Defect 1: a project whose work-source binding drifted (or was never
 * persisted) otherwise just throws the first time a Jira-backed dashboard surface tries to read it
 * ("Missing Atlassian account or project binding...", see `t3team-atlassianResourceSnapshotCache.ts`)
 * with no way out of the wizard. This banner sits at the dashboard header — before any Jira-backed
 * fetch even runs, and regardless of which dashboard view (backlog/my-work) is active — and opens
 * the user-initiated repair dialog. Kept as its own component so `t3team-ProjectDashboard.tsx` only
 * needs one import and one render line.
 */
export function ProjectBindingRepairBanner({
  project,
  onProjectUpdated,
}: {
  project: ProjectShellProject;
  onProjectUpdated: (project: ProjectShellProject) => void;
}) {
  const [repairOpen, setRepairOpen] = useState(false);
  const needsRepair = projectBindingState(project.source) === "needs-repair";

  if (!needsRepair) return null;

  return (
    <>
      <div className="px-4 pt-3 sm:px-6">
        <T3SurfaceCard role="alert" tone="danger">
          <T3SurfaceCardContent className="flex flex-wrap items-center gap-x-3 gap-y-1.5 p-2.5">
            <AlertTriangle className="size-4 shrink-0 text-destructive" aria-hidden="true" />
            <p className="min-w-0 flex-1 text-xs leading-5 text-foreground">
              <span className="font-medium">This project's Jira connection is broken.</span>{" "}
              <span className="text-muted-foreground">
                Reconnect it to see and work its tickets again.
              </span>
            </p>
            <Button
              type="button"
              size="xs"
              variant="outline"
              className="shrink-0"
              onClick={() => setRepairOpen(true)}
            >
              Repair binding
            </Button>
          </T3SurfaceCardContent>
        </T3SurfaceCard>
      </div>

      {repairOpen ? (
        <RepairProjectBindingDialog
          project={project}
          onClose={() => setRepairOpen(false)}
          onProjectUpdated={(next) => {
            onProjectUpdated(next);
            setRepairOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
