import { useEffect, useMemo, useState } from "react";
import type { ProjectShellProject } from "@t3tools/project-context";
import { RepositoryPicker } from "~/t3team/components/t3team-RepositoryPicker";
import { Card } from "~/t3team/components/ui/t3team-card";
import { parseRepositoryLabel, splitRepositoryInput } from "~/t3team/components/t3team-linkedRepositories";
import { LinkedRepositoriesDialogView } from "~/t3team/components/t3team-LinkedRepositoriesDialogView";
import { LinkedRepositoryMainMarker } from "~/t3team/components/t3team-LinkedRepositoryMainMarker";
import {
  normalizeRepositoryUrls,
  readLinkedRepositoryUrlsFromProject,
} from "~/t3team/hooks/t3team-createProjectBootstrap";
import { resolveMainRepositoryUrl } from "~/t3team/hooks/t3team-linkedRepositoryMainSelection";
import { readMainRepositoryFromProject } from "~/t3team/hooks/t3team-projectMainRepository";
import { useSaveProjectRepositories } from "~/t3team/hooks/t3team-useSaveProjectRepositories";
import { useLinkedRepositorySyncStatus } from "~/t3team/hooks/t3team-useLinkedRepositorySyncStatus";
import { LinkedRepositorySyncStatusLine } from "~/t3team/components/t3team-LinkedRepositorySyncStatusLine";
import { useGitHubRepositoryDiscovery } from "~/t3team/hooks/t3team-useGitHubRepositoryDiscovery";
import { LinkedRepositorySyncModal } from "~/t3team/components/t3team-LinkedRepositorySyncModal";
import { LinkedRepositoryBranchControl } from "~/t3team/components/t3team-LinkedRepositoryBranchControl";
import { useLinkedRepositoryBranches } from "~/t3team/hooks/t3team-useLinkedRepositoryBranches";
import { useServerConfig } from "~/t3team/t3team-serverState";
import { readServerFeatureFlag, readServerFeatureFlagOr } from "~/t3team/t3team-useFeatureFlag";

export function ManageProjectRepositoriesDialog({
  project,
  onClose,
  onProjectUpdated,
}: {
  project: ProjectShellProject;
  onClose: () => void;
  onProjectUpdated: (project: ProjectShellProject) => void;
}) {
  const currentUrls = useMemo(() => readLinkedRepositoryUrlsFromProject(project), [project]);
  const [linkedRepositoryUrls, setLinkedRepositoryUrls] = useState(currentUrls);
  const syncStatus = useLinkedRepositorySyncStatus({
    workspaceRoot: project.workspace?.rootPath,
    enabled: true,
  });
  const serverConfig = useServerConfig();
  const mainRepositoryEnabled = readServerFeatureFlagOr(
    serverConfig,
    "MAIN_REPOSITORY",
    serverConfig?.mainRepository === true,
  );
  // Off: repositories are still linked and saved; the sync view and sync status go away.
  const syncEnabled = readServerFeatureFlag(serverConfig, "PROJECT_LINKED_REPOSITORIES");
  // An adopted workspace repository is the project workspace itself, not a linked repository.
  const currentMain = readMainRepositoryFromProject(project);
  const adoptedWorkspace = currentMain?.status === "adopted";
  const initialMainUrl = adoptedWorkspace ? null : (currentMain?.url ?? null);
  const [mainRepositoryUrl, setMainRepositoryUrl] = useState<string | null>(initialMainUrl);

  const discovery = useGitHubRepositoryDiscovery({
    enabled: true,
    projectKey: project.source.externalProjectKey ?? undefined,
    projectTitle: project.title ?? undefined,
    linkedRepositoryUrls,
  });

  const branches = useLinkedRepositoryBranches({
    urls: linkedRepositoryUrls,
    recorded: syncStatus.byUrl,
  });

  const dirty =
    branches.changed ||
    mainRepositoryUrl !== initialMainUrl ||
    linkedRepositoryUrls.length !== currentUrls.length ||
    linkedRepositoryUrls.some((url) => !currentUrls.includes(url));

  const applyLinkedUrls = (next: ReadonlyArray<string>) => {
    setMainRepositoryUrl((main) =>
      resolveMainRepositoryUrl({
        linkedUrls: next,
        currentMain: main,
        previousLinkedUrls: linkedRepositoryUrls,
      }),
    );
    setLinkedRepositoryUrls(next);
  };

  const toggleRepository = (url: string) => {
    const next = linkedRepositoryUrls.includes(url)
      ? linkedRepositoryUrls.filter((entry) => entry !== url)
      : normalizeRepositoryUrls([...linkedRepositoryUrls, ...splitRepositoryInput(url)]);
    applyLinkedUrls(next);
  };

  const linkRepositories = (urls: ReadonlyArray<string>) =>
    applyLinkedUrls(normalizeRepositoryUrls([...linkedRepositoryUrls, ...urls]));

  const makeMain = (url: string) => {
    if (linkedRepositoryUrls.includes(url)) setMainRepositoryUrl(url);
  };

  const mainChange =
    mainRepositoryEnabled && mainRepositoryUrl !== initialMainUrl ? mainRepositoryUrl : undefined;
  const { save, saving, saved, saveError, syncView, unchangedSinceSave } =
    useSaveProjectRepositories({
      project,
      linkedRepositoryUrls,
      linkedRepositoryBranches: branches.branches,
      mainRepositoryUrl,
      mainChange,
      syncStatus,
      onProjectUpdated,
    });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, saving]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/50 p-2 sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      {syncEnabled && syncView.visible ? (
        <Card
          role="dialog"
          aria-label="Linked repositories"
          className="flex h-full w-full max-w-6xl flex-col overflow-hidden sm:h-[calc(100dvh-4rem)]"
        >
          <LinkedRepositorySyncModal
            steps={syncView.steps}
            onContinueInBackground={syncView.hide}
            onDone={onClose}
            onBack={syncView.hide}
          />
        </Card>
      ) : (
        <LinkedRepositoriesDialogView
          projectTitle={project.title ?? "this project"}
          linkedUrls={linkedRepositoryUrls}
          mainRepositoryUrl={mainRepositoryUrl}
          adoptedWorkspace={adoptedWorkspace}
          showMainRepository={mainRepositoryEnabled}
          onMakeMain={makeMain}
          onClose={onClose}
          onSave={() => void save()}
          saving={saving}
          saved={saved !== null}
          dirty={dirty && !unchangedSinceSave}
          saveError={saveError}
        >
          <RepositoryPicker
            discovery={discovery}
            linkedUrls={linkedRepositoryUrls}
            onToggle={toggleRepository}
            onLinkMany={linkRepositories}
            renderLinkedStatus={(url) =>
              syncEnabled ? (
                <LinkedRepositorySyncStatusLine
                  entry={syncStatus.byUrl.get(url)}
                  onSync={syncStatus.syncNow}
                />
              ) : null
            }
            renderLinkedControls={(url) => (
              <div className="flex flex-col items-start gap-1.5">
                {mainRepositoryEnabled ? (
                  <LinkedRepositoryMainMarker
                    isMain={url === mainRepositoryUrl}
                    onMakeMain={() => makeMain(url)}
                    disabled={saving}
                    repositoryLabel={parseRepositoryLabel(url)}
                  />
                ) : null}
                <LinkedRepositoryBranchControl
                  workspaceRoot={project.workspace?.rootPath}
                  entry={syncStatus.byUrl.get(url)}
                  value={branches.branchFor(url)}
                  onChange={(branch) => branches.setBranch(url, branch)}
                />
              </div>
            )}
          />
        </LinkedRepositoriesDialogView>
      )}
    </div>
  );
}
