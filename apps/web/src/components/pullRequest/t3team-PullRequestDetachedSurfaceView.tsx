/**
 * The pull-request detail panel on a detached page: the same panel the Pull requests page and
 * a thread's side panel show, given the whole window. It keeps the page URL in step with the
 * open tab and focused file, so reloading the window keeps the reader where they were.
 */
import { useCallback, useMemo, useRef } from "react";

import { isElectron } from "~/env";
import { isTerminalFocused } from "~/lib/terminalFocus";
import type { DetachedSurfaceViewProps } from "~/t3team/detached/t3team-detachedSurfaceKinds";
import { StandalonePage, StandalonePageHeader } from "~/components/ui/standalone-page";

import { PullRequestDetailPanel } from "./PullRequestDetailPanel";
import {
  pullRequestDetailViewStateSearchPatch,
  type PullRequestDetailViewState,
} from "./t3team-prDetailViewState.logic";
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

const viewKey = (view: PullRequestDetailViewState) => `${view.tab}\n${view.file ?? ""}`;

export function PullRequestDetachedSurfaceView({
  params,
  onParamsChange,
}: DetachedSurfaceViewProps) {
  // Keyed by the values, not the params object: every URL write hands over a new object, and a
  // new `reference` each time resets the panel's per-reference state — which reports the view,
  // which writes the URL, which hands over a new object, around and around.
  const { environmentId, projectId, host, repository, number, tab, file } = params;
  const surface = useMemo(
    () =>
      pullRequestDetachedSurfaceFromParams({
        environmentId,
        projectId,
        host,
        repository,
        number,
        tab,
        file,
      }),
    [environmentId, projectId, host, repository, number, tab, file],
  );

  // The URL's view changes two ways: the panel reporting where the reader went (written below),
  // or from outside — the desktop bringing this window forward on another tab. The panel reads
  // the view it opens on only when it mounts, so an outside change opens it afresh there; its
  // own reports never do.
  const urlViewKey = surface === null ? null : viewKey(surface.view);
  const expectedViewKey = useRef(urlViewKey);
  const generation = useRef(0);
  if (urlViewKey !== expectedViewKey.current) {
    expectedViewKey.current = urlViewKey;
    generation.current += 1;
  }
  const onViewChange = useCallback(
    (view: PullRequestDetailViewState) => {
      const reported = viewKey(view);
      if (reported === expectedViewKey.current) return;
      expectedViewKey.current = reported;
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
      key={`${surface.environmentId}:${surface.reference.projectId}:${surface.reference.host ?? ""}:${surface.reference.repository}#${surface.reference.number}:${generation.current}`}
      environmentId={surface.environmentId}
      reference={surface.reference}
      shortcutsEnabled
      getShortcutContext={getShortcutContext}
      initialView={surface.view}
      onViewChange={onViewChange}
    />
  );
}
