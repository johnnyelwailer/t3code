import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import type { ProjectShellProject } from "@t3tools/project-context";
import { T3TeamErrorState } from "~/t3team/components/error/t3team-ErrorState";
import { RepositoryPicker } from "~/t3team/components/t3team-RepositoryPicker";
import { Button } from "~/t3team/components/ui/t3team-button";
import { Card } from "~/t3team/components/ui/t3team-card";
import { splitRepositoryInput } from "~/t3team/components/t3team-linkedRepositories";
import { MainRepositoryPicker } from "~/t3team/components/t3team-MainRepositoryPicker";
import {
  normalizeRepositoryUrls,
  readLinkedRepositoryUrlsFromProject,
} from "~/t3team/hooks/t3team-createProjectBootstrap";
import {
  readMainRepositoryCandidatesFromProject,
  readMainRepositoryFromProject,
} from "~/t3team/hooks/t3team-projectMainRepository";
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
  const initialMainUrl = currentMain?.status === "adopted" ? null : (currentMain?.url ?? null);
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

  const toggleRepository = (url: string) => {
    setLinkedRepositoryUrls((current) =>
      current.includes(url)
        ? current.filter((entry) => entry !== url)
        : normalizeRepositoryUrls([...current, ...splitRepositoryInput(url)]),
    );
    if (url === mainRepositoryUrl) setMainRepositoryUrl(null);
  };

  const linkRepositories = (urls: ReadonlyArray<string>) =>
    setLinkedRepositoryUrls((current) => normalizeRepositoryUrls([...current, ...urls]));

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
      <Card
        role="dialog"
        aria-label="Linked repositories"
        className="flex h-full w-full max-w-6xl flex-col overflow-hidden sm:h-[calc(100dvh-4rem)]"
      >
        {syncEnabled && syncView.visible ? (
          <LinkedRepositorySyncModal
            steps={syncView.steps}
            onContinueInBackground={syncView.hide}
            onDone={onClose}
            onBack={syncView.hide}
          />
        ) : (
          <>
            <header className="flex items-start justify-between gap-3 px-5 pt-5 pb-4">
              <div className="min-w-0">
                <h2 className="text-base font-semibold">Linked repositories</h2>
                <p className="truncate text-xs text-muted-foreground">
                  Code, PRs and branches for {project.title ?? "this project"} come from these.
                </p>
              </div>
              <Button size="icon-xs" variant="ghost" onClick={onClose} aria-label="Close dialog">
                <X className="size-4" />
              </Button>
            </header>

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
                <LinkedRepositoryBranchControl
                  workspaceRoot={project.workspace?.rootPath}
                  entry={syncStatus.byUrl.get(url)}
                  value={branches.branchFor(url)}
                  onChange={(branch) => branches.setBranch(url, branch)}
                />
              )}
            />

            {mainRepositoryEnabled && linkedRepositoryUrls.length > 0 ? (
              <div className="border-t border-border px-4 py-3">
                <MainRepositoryPicker
                  repositoryUrls={linkedRepositoryUrls}
                  candidates={readMainRepositoryCandidatesFromProject(project)}
                  value={mainRepositoryUrl}
                  onChange={setMainRepositoryUrl}
                  disabled={saving}
                />
              </div>
            ) : null}

            {saveError ? (
              <div className="border-t border-border p-3">
                <T3TeamErrorState
                  error={saveError}
                  action="updating linked repositories"
                  onRetry={() => void save()}
                />
              </div>
            ) : null}

            <footer className="flex items-center justify-between gap-2 border-t border-border bg-card px-5 py-3.5">
              <span className="text-xs text-muted-foreground">
                {linkedRepositoryUrls.length} linked
                {unchangedSinceSave
                  ? " · saved, repositories sync when needed"
                  : dirty
                    ? " · unsaved changes"
                    : ""}
              </span>
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={onClose} disabled={saving}>
                  {saved === null ? "Cancel" : "Close"}
                </Button>
                <Button
                  onClick={() => void save()}
                  disabled={saving || !dirty || unchangedSinceSave}
                >
                  {saving ? "Saving..." : unchangedSinceSave ? "Saved" : "Save"}
                </Button>
              </div>
            </footer>
          </>
        )}
      </Card>
    </div>
  );
}
