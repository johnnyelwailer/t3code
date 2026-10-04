import type { ProjectShellProject } from "@t3tools/project-context";
import type { ServerProvider } from "@t3tools/contracts";

import { AppMainContentHomeEmptyState } from "~/t3team/t3team-AppMainContentHomeEmptyState";
import type { ProjectKickoffThreadInput } from "~/t3team/t3team-kickoffTypes";
import {
  T3TEAM_FIRST_PROJECT_SETUP_REASON,
  type T3TeamSetupSurfaceReason,
} from "~/t3team/t3team-setupSurfaceReason";

export function AppMainContentHomeBrowser({
  onCreate,
  onInlineProjectCreated,
  showInitialSetup,
  setupSurfaceReason = T3TEAM_FIRST_PROJECT_SETUP_REASON,
  showAside,
  shouldInsetDesktopHeader = false,
  scratchProject,
  onStartScratch,
  providers,
  isConnected,
  onOpenHomeThread,
  onKickoffProjectThread,
}: {
  onCreate: () => void;
  onInlineProjectCreated: (project: ProjectShellProject) => void;
  showInitialSetup: boolean;
  setupSurfaceReason?: T3TeamSetupSurfaceReason;
  showAside: boolean;
  shouldInsetDesktopHeader?: boolean;
  /** Upstream's Scratch project ("No project"), once it exists; the home kickoff targets it. */
  scratchProject: ProjectShellProject | null;
  onStartScratch: (() => void) | undefined;
  providers: ReadonlyArray<ServerProvider>;
  isConnected: boolean;
  onOpenHomeThread: (threadId: string) => void;
  onKickoffProjectThread: (input: ProjectKickoffThreadInput) => void;
}) {
  return (
    <AppMainContentHomeEmptyState
      onCreate={onCreate}
      onInlineProjectCreated={onInlineProjectCreated}
      showInitialSetup={showInitialSetup}
      setupSurfaceReason={setupSurfaceReason}
      showAside={showAside}
      shouldInsetDesktopHeader={shouldInsetDesktopHeader}
      scratchProject={scratchProject}
      onStartScratch={onStartScratch}
      providers={providers}
      isConnected={isConnected}
      onOpenHomeThread={onOpenHomeThread}
      onKickoffHomeThread={(
        kickoffMessage,
        kickoffPending,
        kickoffModelSelection,
        kickoffRuntimeMode,
        kickoffInteractionMode,
        selectedToolIds,
        kickoffContextAttachments,
        kickoffWorkflow,
      ) => {
        if (!scratchProject) return;
        onKickoffProjectThread({
          projectId: scratchProject.id,
          kickoffMessage,
          ...(kickoffPending !== undefined ? { kickoffPending } : {}),
          kickoffModelSelection,
          kickoffRuntimeMode,
          kickoffInteractionMode,
          selectedToolIds,
          kickoffContextAttachments,
          ...(kickoffWorkflow ? { kickoffWorkflow } : {}),
        });
      }}
    />
  );
}
