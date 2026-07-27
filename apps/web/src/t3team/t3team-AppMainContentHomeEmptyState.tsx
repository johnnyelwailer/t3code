import { useEffect, useState } from "react";
import type { ServerProvider } from "@t3tools/contracts";
import type { ProjectShellProject } from "@t3tools/project-context";

import { CreateProjectDialog } from "~/t3team/t3team-CreateProjectDialog";
import type { ProjectDashboardKickoffAsideProps } from "~/t3team/t3team-ProjectDashboardKickoffAsideTypes";
import {
  T3TEAM_FIRST_PROJECT_SETUP_REASON,
  type T3TeamSetupSurfaceReason,
} from "~/t3team/t3team-setupSurfaceReason";
import type { ProjectThread } from "~/t3team/t3team-types";
import { runT3TeamViewTransition } from "~/t3team/t3team-runViewTransition";

import { ProjectBrowserEmptyWithChat } from "./t3team-AppMainContentShell";

export function AppMainContentHomeEmptyState({
  onCreate,
  onInlineProjectCreated,
  showInitialSetup,
  setupSurfaceReason = T3TEAM_FIRST_PROJECT_SETUP_REASON,
  showAside,
  shouldInsetDesktopHeader = false,
  homeChatProject,
  homeChatProjectThreads,
  providers,
  isConnected,
  onOpenHomeThread,
  onKickoffHomeThread,
}: {
  onCreate: () => void;
  onInlineProjectCreated: (project: ProjectShellProject) => void;
  showInitialSetup: boolean;
  setupSurfaceReason?: T3TeamSetupSurfaceReason;
  showAside: boolean;
  shouldInsetDesktopHeader?: boolean;
  homeChatProject: ProjectShellProject | null;
  homeChatProjectThreads: ProjectThread[];
  providers: ReadonlyArray<ServerProvider>;
  isConnected: boolean;
  onOpenHomeThread: (threadId: string) => void;
  onKickoffHomeThread: ProjectDashboardKickoffAsideProps["onKickoffThread"];
}) {
  const [showInlineCreateWizard, setShowInlineCreateWizard] = useState(false);

  useEffect(() => {
    if (!showInitialSetup) {
      setShowInlineCreateWizard(false);
    }
  }, [showInitialSetup]);

  return (
    <ProjectBrowserEmptyWithChat
      onCreate={
        showInitialSetup
          ? () =>
              runT3TeamViewTransition(() => setShowInlineCreateWizard(true), {
                types: ["t3team-wizard-forward"],
              })
          : onCreate
      }
      setupSurfaceReason={setupSurfaceReason}
      showAside={showAside}
      shouldInsetDesktopHeader={shouldInsetDesktopHeader}
      emptyContent={
        showInlineCreateWizard ? (
          <CreateProjectDialog
            variant="inline"
            onClose={() =>
              runT3TeamViewTransition(() => setShowInlineCreateWizard(false), {
                types: ["t3team-wizard-back"],
              })
            }
            onCreated={(project) => {
              onInlineProjectCreated(project);
              setShowInlineCreateWizard(false);
            }}
          />
        ) : undefined
      }
      showInlineCreateWizard={showInlineCreateWizard}
      project={homeChatProject}
      projectThreads={homeChatProjectThreads}
      providers={providers}
      isConnected={isConnected}
      onOpenThread={onOpenHomeThread}
      onKickoffThread={onKickoffHomeThread}
    />
  );
}
