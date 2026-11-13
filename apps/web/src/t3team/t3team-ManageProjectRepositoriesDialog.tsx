import { useEffect, useMemo, useState } from "react";
import type { ProjectShellProject } from "@t3tools/project-context";
import { RepositoryPicker } from "~/t3team/components/t3team-RepositoryPicker";
import {
  parseRepositoryLabel,
  splitRepositoryInput,
} from "~/t3team/components/t3team-linkedRepositories";
import { LinkedRepositoriesDialogView } from "~/t3team/components/t3team-LinkedRepositoriesDialogView";
import { LinkedRepositoryMainMarker } from "~/t3team/components/t3team-LinkedRepositoryMainMarker";
import {
  normalizeRepositoryUrls,
  readLinkedRepositoryUrlsFromProject,
} from "~/t3team/hooks/t3team-createProjectBootstrap";
import { resolveMainRepositoryUrl } from "~/t3team/hooks/t3team-linkedRepositoryMainSelection";
import {
  canPersistMainRepositoryNow,
  isMainPersistPending,
} from "~/t3team/hooks/t3team-mainRepositoryOptimistic";
import { usePersistMainRepository } from "~/t3team/hooks/t3team-persistMainRepository";
import { readMainRepositoryFromProject } from "~/t3team/hooks/t3team-projectMainRepository";
import { useSaveProjectRepositories } from "~/t3team/hooks/t3team-useSaveProjectRepositories";
import { useLinkedRepositorySyncStatus } from "~/t3team/hooks/t3team-useLinkedRepositorySyncStatus";
import { LinkedRepositorySyncStatusLine } from "~/t3team/components/t3team-LinkedRepositorySyncStatusLine";
import { useGitHubRepositoryDiscovery } from "~/t3team/hooks/t3team-useGitHubRepositoryDiscovery";
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
  const {
    state: mainState,
    persist: persistMain,
    setLocal,
    retry: retryMain,
  } = usePersistMainRepository({
    project,
    initialMainUrl,
    onProjectUpdated,
  });
  const mainRepositoryUrl = mainState.mainUrl;
  const mainPending = isMainPersistPending(mainState);

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
    linkedRepositoryUrls.length !== currentUrls.length ||
    linkedRepositoryUrls.some((url) => !currentUrls.includes(url));

  const assignMain = (nextUrl: string | null, revertOnFailure: boolean) => {
    if (canPersistMainRepositoryNow(nextUrl, currentUrls)) {
      void persistMain(nextUrl, revertOnFailure);
      return;
    }
    setLocal(nextUrl);
  };

  const applyLinkedUrls = (next: ReadonlyArray<string>) => {
    const newMain = resolveMainRepositoryUrl({
      linkedUrls: next,
      currentMain: mainRepositoryUrl,
      previousLinkedUrls: linkedRepositoryUrls,
    });
    setLinkedRepositoryUrls(next);
    if (newMain === mainRepositoryUrl) return;
    const previousCommittedStillLinked =
      mainState.committedUrl !== null && next.includes(mainState.committedUrl);
    assignMain(newMain, previousCommittedStillLinked);
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
    if (!linkedRepositoryUrls.includes(url)) return;
    if (url === mainRepositoryUrl && mainState.error === null) return;
    assignMain(url, true);
  };

  const { save, saving, saved, saveError, unchangedSinceSave } = useSaveProjectRepositories({
    project,
    linkedRepositoryUrls,
    linkedRepositoryBranches: branches.branches,
    syncStatus,
    onProjectUpdated,
  });

  const handleSave = async () => {
    const nextProject = await save();
    if (!nextProject) return;
    const localMain = mainState.mainUrl;
    const savedMainRecord = readMainRepositoryFromProject(nextProject);
    const savedMain = savedMainRecord?.status === "adopted" ? null : (savedMainRecord?.url ?? null);
    if (localMain === savedMain) return;
    const savedUrls = readLinkedRepositoryUrlsFromProject(nextProject);
    if (canPersistMainRepositoryNow(localMain, savedUrls)) {
      void persistMain(localMain, true);
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving && !mainPending) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, saving, mainPending]);

  const busy = saving || mainPending;

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/50 p-2 sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <LinkedRepositoriesDialogView
        projectTitle={project.title ?? "this project"}
        linkedUrls={linkedRepositoryUrls}
        mainRepositoryUrl={mainRepositoryUrl}
        adoptedWorkspace={adoptedWorkspace}
        showMainRepository={mainRepositoryEnabled}
        onMakeMain={makeMain}
        onClose={onClose}
        onSave={() => void handleSave()}
        saving={saving}
        mainPending={mainPending}
        saved={saved !== null}
        dirty={dirty && !unchangedSinceSave}
        saveError={saveError}
        pendingMainUrl={mainState.pendingUrl}
        mainError={mainState.error}
        onRetryMain={retryMain}
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
                  disabled={busy}
                  pending={mainState.pendingUrl === url}
                  error={mainState.error?.url === url ? mainState.error.message : null}
                  onRetry={mainState.error?.url === url ? retryMain : undefined}
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
    </div>
  );
}
