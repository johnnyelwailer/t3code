import type { ProjectShellProject } from "@t3tools/project-context";
import type { ServerProvider } from "@t3tools/contracts";

import { AppMainContentHomeEmptyState } from "~/t3work/t3work-AppMainContentHomeEmptyState";
import type { ProjectKickoffThreadInput } from "~/t3work/t3work-kickoffTypes";
import type { ProjectThread } from "~/t3work/t3work-types";

export function AppMainContentHomeBrowser({
  onCreate,
  onInlineProjectCreated,
  showInitialSetup,
  showAside,
  shouldInsetDesktopHeader = false,
  homeChatProject,
  homeChatProjectThreads,
  providers,
  isConnected,
  onOpenHomeThread,
  onKickoffProjectThread,
}: {
  onCreate: () => void;
  onInlineProjectCreated: (project: ProjectShellProject) => void;
  showInitialSetup: boolean;
  showAside: boolean;
  shouldInsetDesktopHeader?: boolean;
  homeChatProject: ProjectShellProject | null;
  homeChatProjectThreads: ProjectThread[];
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
      showAside={showAside}
      shouldInsetDesktopHeader={shouldInsetDesktopHeader}
      homeChatProject={homeChatProject}
      homeChatProjectThreads={homeChatProjectThreads}
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
        if (!homeChatProject) return;
        onKickoffProjectThread({
          projectId: homeChatProject.id,
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
