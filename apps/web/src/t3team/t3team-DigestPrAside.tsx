import type { ReactNode } from "react";

import { isElectron } from "~/env";
import { PullRequestDetailPanel } from "~/components/pullRequest/PullRequestDetailPanel";
import { usePrimaryEnvironmentId } from "~/state/environments";

import {
  closeDigestPullRequest,
  openDigestPullRequest,
  useDigestPrAsideStore,
} from "./t3team-digestPrAsideStore";

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

/**
 * The dashboard aside: a PR a digest chip opened, in the app's own PR detail panel, else whatever
 * the aside shows by default. Closing the PR brings the default back.
 */
export function DigestPrAside({ fallback }: { fallback: ReactNode }) {
  const pullRequest = useDigestPrAsideStore((state) => state.pullRequest);
  const environmentId = usePrimaryEnvironmentId();
  if (pullRequest === null || environmentId === null) return fallback;
  // The panel's own header carries the close button (`onClose`), so the aside adds no chrome.
  return (
    <PullRequestDetailPanel
      key={`${pullRequest.host ?? ""}:${pullRequest.repository}#${pullRequest.number}`}
      environmentId={environmentId}
      shortcutsEnabled
      getShortcutContext={getShortcutContext}
      reference={pullRequest}
      onSelectPullRequest={openDigestPullRequest}
      onClose={closeDigestPullRequest}
    />
  );
}
