/**
 * The quiet, non-modal offer to put the composer's project on the machine a pending cloud setup
 * runs on. It replaces an auto-opened add-to-machine dialog: the dialog is a user action, and is
 * only worth offering while that machine is reachable and can actually take a clone.
 */
import { DownloadIcon } from "lucide-react";

import { openAddProjectToMachine } from "~/components/AddProjectToMachineDialog";
import type { ComposerBannerStackItem } from "~/components/chat/ComposerBannerStack";
import { Button } from "~/components/ui/button";
import { useAddProjectTargets } from "~/hooks/useAddProjectTargets";
import { useLogicalProjectEnvironments } from "~/hooks/useLogicalProjectEnvironments";
import { useProject } from "~/state/entities";
import { useCloudProjectCloneSuggestion } from "./t3team-cloudProjectCloneSuggestion";

export function useCloudProjectCloneBanner(
  scopeKey: string | null,
): ComposerBannerStackItem | null {
  const suggestion = useCloudProjectCloneSuggestion(scopeKey);
  const project = useProject(suggestion?.projectRef ?? null);
  const targets = useAddProjectTargets(project, useLogicalProjectEnvironments(project, false));
  if (suggestion === null || project === null) return null;
  // `useAddProjectTargets` lists only machines that are connected and allowed to clone, so a
  // disconnected cloud machine offers nothing rather than a dialog that cannot finish.
  const target = targets.find((item) => item.environmentId === suggestion.targetEnvironmentId);
  if (target === undefined) return null;
  const { projectRef, targetEnvironmentId } = suggestion;
  const name = project.repositoryIdentity?.displayName ?? project.title;
  return {
    id: `cloud-project-clone:${targetEnvironmentId}:${projectRef.projectId}`,
    variant: "info",
    group: "environment",
    icon: <DownloadIcon className="size-3" aria-hidden />,
    title: `${name} is not on ${target.label} yet`,
    description: "Add it there to run this thread on that machine.",
    actions: (
      <Button
        size="xs"
        variant="ghost"
        data-cloud-project-clone-suggestion=""
        onClick={() => openAddProjectToMachine({ projectRef, targetEnvironmentId })}
      >
        Add to machine
      </Button>
    ),
  };
}
