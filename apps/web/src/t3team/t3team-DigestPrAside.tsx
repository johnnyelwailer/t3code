import type { ProjectShellProject } from "@t3tools/project-context";
import type { ReactNode } from "react";

import { isElectron } from "~/env";
import { PullRequestDetailPanel } from "~/components/pullRequest/PullRequestDetailPanel";
import { usePrimaryEnvironmentId } from "~/state/environments";

import { DigestTicketAside } from "./t3team-DigestTicketAside";
import type { ProjectThread } from "./t3team-types";
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
 * The dashboard aside: a PR a digest chip opened (the app's own PR detail panel) or a ticket a row
 * opened (its work-item detail), else whatever the aside shows by default. Closing either brings
 * the default back.
 */
export function DigestPrAside({
  project,
  projectThreads,
  onRememberEmbeddedThread,
  fallback,
}: {
  /** The dashboard's project: a detail opened from another project's digest does not follow along. */
  project: ProjectShellProject;
  projectThreads: ProjectThread[];
  onRememberEmbeddedThread: (threadId: string) => void;
  fallback: ReactNode;
}) {
  const projectId: string = project.id;
  const pullRequest = useDigestPrAsideStore((state) => state.pullRequest);
  const ticket = useDigestPrAsideStore((state) => state.ticket);
  const environmentId = usePrimaryEnvironmentId();
  if (ticket !== null && ticket.projectId === projectId) {
    return (
      <DigestTicketAside
        key={ticket.ticketId}
        project={project}
        ticket={ticket}
        projectThreads={projectThreads}
        onRememberEmbeddedThread={onRememberEmbeddedThread}
      />
    );
  }
  if (pullRequest === null || environmentId === null || pullRequest.projectId !== projectId) {
    return fallback;
  }
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
