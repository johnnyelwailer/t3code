import { useEffect, useState } from "react";
import type { ProjectShellProject } from "@t3tools/project-context";
import type {
  ModelSelection,
  ProviderInteractionMode,
  RuntimeMode,
  ServerProvider,
} from "@t3tools/contracts";

import type { T3WorkContextAttachment } from "~/t3work/t3work-contextAttachment";
import { CreateProjectDialog } from "~/t3work/t3work-CreateProjectDialog";
import type { ProjectThread } from "~/t3work/t3work-types";

import { ProjectBrowserEmptyWithChat } from "./t3work-AppMainContentShell";

export function AppMainContentHomeEmptyState({
  onCreate,
  onInlineProjectCreated,
  isFirstRunSetup,
  showAside,
  homeChatProject,
  homeChatProjectThreads,
  providers,
  isConnected,
  onOpenHomeThread,
  onKickoffHomeThread,
}: {
  onCreate: () => void;
  onInlineProjectCreated: (project: ProjectShellProject) => void;
  isFirstRunSetup: boolean;
  showAside: boolean;
  homeChatProject: ProjectShellProject | null;
  homeChatProjectThreads: ProjectThread[];
  providers: ReadonlyArray<ServerProvider>;
  isConnected: boolean;
  onOpenHomeThread: (threadId: string) => void;
  onKickoffHomeThread: (
    kickoffMessage: string,
    kickoffModelSelection: ModelSelection,
    kickoffRuntimeMode: RuntimeMode,
    kickoffInteractionMode: ProviderInteractionMode,
    kickoffContextAttachments: ReadonlyArray<T3WorkContextAttachment>,
  ) => void;
}) {
  const [showInlineCreateWizard, setShowInlineCreateWizard] = useState(false);

  useEffect(() => {
    if (!isFirstRunSetup) {
      setShowInlineCreateWizard(false);
    }
  }, [isFirstRunSetup]);

  return (
    <ProjectBrowserEmptyWithChat
      onCreate={isFirstRunSetup ? () => setShowInlineCreateWizard(true) : onCreate}
      showAside={showAside}
      emptyContent={
        showInlineCreateWizard ? (
          <CreateProjectDialog
            variant="inline"
            onClose={() => setShowInlineCreateWizard(false)}
            onCreated={(project) => {
              onInlineProjectCreated(project);
              setShowInlineCreateWizard(false);
            }}
          />
        ) : undefined
      }
      project={homeChatProject}
      projectThreads={homeChatProjectThreads}
      providers={providers}
      isConnected={isConnected}
      onOpenThread={onOpenHomeThread}
      onKickoffThread={onKickoffHomeThread}
    />
  );
}
