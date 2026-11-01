/**
 * My Work's shared aside: real `RightPanelTabs` on `MY_WORK_PANEL_REF`, with Agent kickoff as the
 * default body when no surface is selected. Digest PR opens become pull-request tabs; ticket-only
 * detail stays on DigestTicketAside until a later work-item surface exists.
 */
import type { EnvironmentId, PullRequestRef } from "@t3tools/contracts";
import type { ProjectShellProject } from "@t3tools/project-context";
import { PinIcon } from "lucide-react";
import { type ReactNode, useEffect } from "react";

import { isElectron } from "~/env";
import { RightPanelTabs } from "~/components/RightPanelTabs";
import { isPreviewSupportedInRuntime } from "~/previewStateStore";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { useServerKeybindings } from "./t3team-serverState";
import {
  MY_WORK_PANEL_REF,
  selectSelectedRightPanelSurface,
  selectThreadRightPanelState,
  useRightPanelStore,
  type RightPanelSurface,
} from "~/rightPanelStore";

import { DigestTicketAside } from "./t3team-DigestTicketAside";
import { closeDigestPullRequest, useDigestPrAsideStore } from "./t3team-digestPrAsideStore";
import { renderMyWorkRightPanelSurface } from "./t3team-MyWorkRightPanelContent";
import type { ProjectThread } from "./t3team-types";

const EMPTY_PENDING_SURFACES = new Set<string>();
const EMPTY_PREVIEW_SESSIONS = {};
const EMPTY_PREVIEW_DESKTOP_STATE = {};
const EMPTY_TERMINAL_LABELS = new Map<string, string>();

function openMyWorkPullRequest(reference: PullRequestRef, environmentId: EnvironmentId) {
  useRightPanelStore.getState().openPullRequest(MY_WORK_PANEL_REF, {
    projectId: reference.projectId,
    repository: reference.repository,
    number: reference.number,
    ...(reference.host ? { host: reference.host } : {}),
    environmentId,
  });
  useRightPanelStore.getState().show(MY_WORK_PANEL_REF);
}

const MY_WORK_SHORTCUT_CONTEXT = () => ({
  terminalFocus: false,
  terminalOpen: false,
  previewFocus: false,
  previewOpen: false,
  isWeb: !isElectron,
  isDesktop: isElectron,
});

export function MyWorkRightPanel({
  project,
  projectThreads,
  onRememberEmbeddedThread,
  kickoff,
  chatTab,
}: {
  /** Scope for ticket detail; a ticket from another project does not follow into this aside. */
  project: ProjectShellProject | null;
  projectThreads: ProjectThread[];
  onRememberEmbeddedThread: (threadId: string) => void;
  kickoff: ReactNode;
  /** The context chat (`CONTEXT_CHAT_TAB`): a pinned Chat tab whose body replaces the kickoff. */
  chatTab?: ReactNode;
}) {
  const environmentId = usePrimaryEnvironmentId();
  const keybindings = useServerKeybindings();
  const panelState = useRightPanelStore((state) =>
    selectThreadRightPanelState(state.byThreadKey, MY_WORK_PANEL_REF),
  );
  const activeSurface = useRightPanelStore((state) =>
    selectSelectedRightPanelSurface(state.byThreadKey, MY_WORK_PANEL_REF),
  );
  const digestPullRequest = useDigestPrAsideStore((state) => state.pullRequest);
  const digestTicket = useDigestPrAsideStore((state) => state.ticket);

  // Digest chips still write the aside store; bridge that into the shared panel ref.
  useEffect(() => {
    if (digestPullRequest === null || environmentId === null) return;
    openMyWorkPullRequest(digestPullRequest, environmentId);
  }, [digestPullRequest, environmentId]);

  // Ticket-only detail stays on the Agent path; clear tab surfaces so kickoff/ticket is visible.
  useEffect(() => {
    if (digestTicket === null) return;
    useRightPanelStore.getState().closeAllSurfaces(MY_WORK_PANEL_REF);
  }, [digestTicket]);

  const projectId = project?.id ?? null;
  const ticketForProject =
    digestTicket !== null && projectId !== null && digestTicket.projectId === projectId
      ? digestTicket
      : null;

  const emptyBody =
    ticketForProject !== null && project !== null ? (
      <DigestTicketAside
        key={ticketForProject.ticketId}
        project={project}
        ticket={ticketForProject}
        projectThreads={projectThreads}
        onRememberEmbeddedThread={onRememberEmbeddedThread}
      />
    ) : (
      (chatTab ?? kickoff)
    );

  const closeSurface = (surface: RightPanelSurface) => {
    useRightPanelStore.getState().closeSurface(MY_WORK_PANEL_REF, surface.id);
    if (surface.kind === "pull-request") {
      const remaining = selectThreadRightPanelState(
        useRightPanelStore.getState().byThreadKey,
        MY_WORK_PANEL_REF,
      ).surfaces.some((entry) => entry.kind === "pull-request");
      if (!remaining) closeDigestPullRequest();
    }
  };

  return (
    <RightPanelTabs
      mode="embedded"
      keybindings={keybindings}
      // The aside has no terminal, preview or composer of its own to be focused.
      getShortcutContext={MY_WORK_SHORTCUT_CONTEXT}
      surfaces={panelState.surfaces}
      environmentId={environmentId}
      activeSurfaceId={activeSurface?.id ?? null}
      pendingSurfaceIds={EMPTY_PENDING_SURFACES}
      previewSessions={EMPTY_PREVIEW_SESSIONS}
      desktopByTabId={EMPTY_PREVIEW_DESKTOP_STATE}
      terminalLabelsById={EMPTY_TERMINAL_LABELS}
      emptyState={emptyBody}
      {...(chatTab === undefined
        ? {}
        : {
            pinnedTab: {
              label: "Chat",
              icon: PinIcon,
              onActivate: () => {
                if (digestTicket !== null) closeDigestPullRequest();
                useRightPanelStore.getState().activatePinned(MY_WORK_PANEL_REF);
              },
            },
          })}
      onActivate={(surface) =>
        useRightPanelStore.getState().activateSurface(MY_WORK_PANEL_REF, surface.id)
      }
      onCloseSurface={closeSurface}
      onCloseOtherSurfaces={(surface) =>
        useRightPanelStore.getState().closeOtherSurfaces(MY_WORK_PANEL_REF, surface.id)
      }
      onCloseSurfacesToRight={(surface) =>
        useRightPanelStore.getState().closeSurfacesToRight(MY_WORK_PANEL_REF, surface.id)
      }
      onCloseAllSurfaces={() => {
        useRightPanelStore.getState().closeAllSurfaces(MY_WORK_PANEL_REF);
        closeDigestPullRequest();
      }}
      onCopyFilePath={() => undefined}
      onAddBrowser={() => {
        const panel = useRightPanelStore.getState();
        panel.openBrowser(MY_WORK_PANEL_REF, null);
        panel.show(MY_WORK_PANEL_REF);
      }}
      onAddBrowserInProfile={() => {
        const panel = useRightPanelStore.getState();
        panel.openBrowser(MY_WORK_PANEL_REF, null);
        panel.show(MY_WORK_PANEL_REF);
      }}
      onAddTerminal={() => undefined}
      onAddDiff={() => undefined}
      onAddFiles={() => undefined}
      onAddPullRequest={() => undefined}
      onAddPullRequests={() => undefined}
      onAddDevice={() => undefined}
      browserAvailable={isPreviewSupportedInRuntime()}
      terminalAvailable={false}
      diffAvailable={false}
      filesAvailable={false}
      pullRequestAvailable={false}
      pullRequestsAvailable={false}
      deviceAvailable={false}
    >
      {renderMyWorkRightPanelSurface({
        activeSurface,
        environmentId,
        onOpenPullRequest: (reference) => {
          if (environmentId !== null) openMyWorkPullRequest(reference, environmentId);
        },
        onCloseSurface: closeSurface,
      })}
    </RightPanelTabs>
  );
}
