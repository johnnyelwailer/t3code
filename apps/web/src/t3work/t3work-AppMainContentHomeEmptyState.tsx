import { useEffect, useState } from "react";
import type { ServerProvider } from "@t3tools/contracts";
import type { ProjectShellProject } from "@t3tools/project-context";

import { CreateProjectDialog } from "~/t3work/t3work-CreateProjectDialog";
import type { ProjectDashboardKickoffAsideProps } from "~/t3work/t3work-ProjectDashboardKickoffAsideTypes";
import type { ProjectThread } from "~/t3work/t3work-types";
import { runT3workViewTransition } from "~/t3work/t3work-runViewTransition";

import { ProjectBrowserEmptyWithChat } from "./t3work-AppMainContentShell";

export function AppMainContentHomeEmptyState({
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
  onKickoffHomeThread,
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
              runT3workViewTransition(() => setShowInlineCreateWizard(true), {
                types: ["t3work-wizard-forward"],
              })
          : onCreate
      }
      showAside={showAside}
      shouldInsetDesktopHeader={shouldInsetDesktopHeader}
      emptyContent={
        showInlineCreateWizard ? (
          <CreateProjectDialog
            variant="inline"
            onClose={() =>
              runT3workViewTransition(() => setShowInlineCreateWizard(false), {
                types: ["t3work-wizard-back"],
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
