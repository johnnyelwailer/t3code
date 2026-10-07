/**
 * The pull-request detail panel on a detached page: the same panel the Pull requests page and
 * a thread's side panel show, given the whole window. It keeps the page URL in step with the
 * open tab and focused file, so reloading the window keeps the reader where they were.
 */
import { useCallback, useMemo } from "react";

import { isElectron } from "~/env";
import { isTerminalFocused } from "~/lib/terminalFocus";
import type { DetachedSurfaceViewProps } from "~/t3team/detached/t3team-detachedSurfaceKinds";
import { StandalonePage, StandalonePageHeader } from "~/components/ui/standalone-page";

import { PullRequestDetailPanel } from "./PullRequestDetailPanel";
import { pullRequestDetailViewStateSearchPatch } from "./t3team-prDetailViewState.logic";
import type { PullRequestDetailViewState } from "./t3team-prDetailViewState.logic";
import { pullRequestDetachedSurfaceFromParams } from "./t3team-pullRequestDetachedSurface.logic";

function getShortcutContext() {
  return {
    terminalFocus: isTerminalFocused(),
    terminalOpen: false,
    previewFocus: false,
    previewOpen: false,
    modelPickerOpen: false,
    isWeb: !isElectron,
    isDesktop: isElectron,
  };
}

export function PullRequestDetachedSurfaceView({ params, onParamsChange }: DetachedSurfaceViewProps) {
  const surface = useMemo(() => pullRequestDetachedSurfaceFromParams(params), [params]);
  const onViewChange = useCallback(
    (view: PullRequestDetailViewState) => {
      const patch = pullRequestDetailViewStateSearchPatch(view);
      onParamsChange({ tab: patch.tab, file: patch.file });
    },
    [onParamsChange],
  );
  if (surface === null) {
    return (
      <StandalonePage tone="error">
        <StandalonePageHeader
          eyebrow="Pull request"
          title="This window does not name a pull request"
          description="Close it and open the pull request again from the app."
        />
      </StandalonePage>
    );
  }
  return (
    <PullRequestDetailPanel
      key={`${surface.environmentId}:${surface.reference.projectId}:${surface.reference.host ?? ""}:${surface.reference.repository}#${surface.reference.number}`}
      environmentId={surface.environmentId}
      reference={surface.reference}
      shortcutsEnabled
      getShortcutContext={getShortcutContext}
      initialView={surface.view}
      onViewChange={onViewChange}
    />
  );
}
