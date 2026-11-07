/**
 * Active-surface body for My Work's shared right panel (PR detail, browser stub).
 */
import type { EnvironmentId, ProjectId, PullRequestRef } from "@t3tools/contracts";
import type { ReactNode } from "react";

import { isElectron } from "~/env";
import { PullRequestDetailPanel } from "~/components/pullRequest/PullRequestDetailPanel";
import type { RightPanelSurface } from "~/rightPanelStore";

import { openDigestPullRequest } from "./t3team-digestPrAsideStore";

function getShortcutContext() {
  return {
    terminalFocus: false,
    terminalOpen: false,
    previewFocus: false,
    previewOpen: false,
    modelPickerOpen: false,
    isWeb: !isElectron,
    isDesktop: isElectron,
  };
}

export function renderMyWorkRightPanelSurface(input: {
  activeSurface: RightPanelSurface | null;
  environmentId: EnvironmentId | null;
  onOpenPullRequest: (reference: PullRequestRef) => void;
  onCloseSurface: (surface: RightPanelSurface) => void;
}): ReactNode {
  const { activeSurface, environmentId, onOpenPullRequest, onCloseSurface } = input;
  if (activeSurface === null) return null;

  if (activeSurface.kind === "pull-request") {
    const panelEnvironmentId =
      (activeSurface.environmentId as EnvironmentId | undefined) ?? environmentId;
    if (panelEnvironmentId === null) return null;
    return (
      <PullRequestDetailPanel
        key={activeSurface.id}
        environmentId={panelEnvironmentId}
        shortcutsEnabled
        getShortcutContext={getShortcutContext}
        reference={{
          projectId: activeSurface.projectId as ProjectId,
          repository: activeSurface.repository,
          number: activeSurface.number,
          ...(activeSurface.host ? { host: activeSurface.host } : {}),
        }}
        onSelectPullRequest={(reference) => {
          openDigestPullRequest(reference);
          onOpenPullRequest(reference);
        }}
        onClose={() => onCloseSurface(activeSurface)}
      />
    );
  }

  if (activeSurface.kind === "preview") {
    return (
      <div className="flex h-full min-h-0 flex-1 items-center justify-center bg-background px-6 text-center text-sm text-muted-foreground">
        Browser tabs opened from My Work use the desktop preview host. Prefer opening a browser from
        a project thread for the full session.
      </div>
    );
  }

  return null;
}
