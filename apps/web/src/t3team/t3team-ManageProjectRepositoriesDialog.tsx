import { useMemo, useState } from "react";
import { Link2, X } from "lucide-react";
import type { ProjectShellProject } from "@t3tools/project-context";
import { T3TeamErrorState } from "~/t3team/components/error/t3team-ErrorState";
import { GitHubRepositoryDiscoverySection } from "~/t3team/components/t3team-GitHubRepositoryDiscoverySection";
import { LinkedRepositoryListEditor } from "~/t3team/components/t3team-LinkedRepositoryListEditor";
import { Button } from "~/t3team/components/ui/t3team-button";
import { Card, CardContent } from "~/t3team/components/ui/t3team-card";
import { ScrollArea } from "~/t3team/components/ui/t3team-scroll-area";
import { splitRepositoryInput } from "~/t3team/components/t3team-linkedRepositories";
import { useBackend } from "~/t3team/backend/t3team-index";
import { MainRepositoryPicker } from "~/t3team/components/t3team-MainRepositoryPicker";
import {
  normalizeRepositoryUrls,
  readLinkedRepositoryUrlsFromProject,
} from "~/t3team/hooks/t3team-createProjectBootstrap";
import {
  readMainRepositoryCandidatesFromProject,
  readMainRepositoryFromProject,
} from "~/t3team/hooks/t3team-projectMainRepository";
import { saveProjectRepositories } from "~/t3team/hooks/t3team-saveProjectRepositories";
import { useServerConfig } from "~/t3team/t3team-serverState";

export function ManageProjectRepositoriesDialog({
  project,
  onClose,
  onProjectUpdated,
}: {
  project: ProjectShellProject;
  onClose: () => void;
  onProjectUpdated: (project: ProjectShellProject) => void;
}) {
  const backend = useBackend();
  const currentUrls = useMemo(() => readLinkedRepositoryUrlsFromProject(project), [project]);
  const [linkedRepositoryUrls, setLinkedRepositoryUrls] = useState(currentUrls);
  const [discoveredRepositoryUrls, setDiscoveredRepositoryUrls] = useState<ReadonlyArray<string>>(
    [],
  );
  const [newRepositoryUrl, setNewRepositoryUrl] = useState("");
  const [saveError, setSaveError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const mainRepositoryEnabled = useServerConfig()?.mainRepository === true;
  // An adopted workspace repository is the project workspace itself, not a linked repository.
  const currentMain = readMainRepositoryFromProject(project);
  const initialMainUrl = currentMain?.status === "adopted" ? null : (currentMain?.url ?? null);
  const [mainRepositoryUrl, setMainRepositoryUrl] = useState<string | null>(initialMainUrl);

  const addRepository = () => {
    const normalized = splitRepositoryInput(newRepositoryUrl);
    if (normalized.length === 0) return;
    setLinkedRepositoryUrls((current) => normalizeRepositoryUrls([...current, ...normalized]));
    setNewRepositoryUrl("");
  };

  const removeRepository = (url: string) => {
    setLinkedRepositoryUrls((current) => current.filter((entry) => entry !== url));
    if (url === mainRepositoryUrl) setMainRepositoryUrl(null);
  };

  const handleDiscoveredRepositoryUrlsChange = (urls: ReadonlyArray<string>) => {
    setDiscoveredRepositoryUrls(urls);
    if (urls.length === 0) return;
    setLinkedRepositoryUrls((current) => normalizeRepositoryUrls([...current, ...urls]));
  };

  const saveLinkedRepositories = async () => {
    setSaveError(null);
    setSaving(true);
    try {
      const nextProject = await saveProjectRepositories({
        backend,
        project,
        linkedRepositoryUrls,
        ...(mainRepositoryEnabled && mainRepositoryUrl !== initialMainUrl
          ? { mainRepositoryUrl }
          : {}),
      });
      onProjectUpdated(nextProject);
      onClose();
    } catch (error) {
      setSaveError(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/40 p-2 sm:items-center sm:p-4">
      <Card className="flex h-full w-full max-w-3xl flex-col overflow-hidden sm:h-[min(42rem,calc(100dvh-2rem))]">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Link2 className="size-4 text-primary" />
            <h2 className="text-sm font-semibold">Manage Linked Repositories</h2>
          </div>
          <Button size="icon-xs" variant="ghost" onClick={onClose} aria-label="Close dialog">
            <X className="size-4" />
          </Button>
        </header>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-4 p-4">
            <Card>
              <CardContent className="space-y-3 p-4">
                <GitHubRepositoryDiscoverySection
                  projectKey={project.source.externalProjectKey ?? undefined}
                  projectTitle={project.title ?? undefined}
                  linkedRepositoryUrls={linkedRepositoryUrls}
                  onVisibleSuggestionsChange={handleDiscoveredRepositoryUrlsChange}
                />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-3 p-4">
                <h3 className="text-sm font-semibold">Linked repositories</h3>
                <LinkedRepositoryListEditor
                  repositoryUrls={linkedRepositoryUrls}
                  newRepositoryUrl={newRepositoryUrl}
                  setNewRepositoryUrl={setNewRepositoryUrl}
                  onAddRepository={addRepository}
                  onRemoveRepository={removeRepository}
                  onAddSearchableOption={(url) =>
                    setLinkedRepositoryUrls((current) => normalizeRepositoryUrls([...current, url]))
                  }
                  searchableRepositoryOptions={discoveredRepositoryUrls}
                  helpText="Saving updates this project and refreshes workspace references."
                />
              </CardContent>
            </Card>

            {mainRepositoryEnabled ? (
              <Card>
                <CardContent className="p-4">
                  <MainRepositoryPicker
                    repositoryUrls={linkedRepositoryUrls}
                    candidates={readMainRepositoryCandidatesFromProject(project)}
                    value={mainRepositoryUrl}
                    onChange={setMainRepositoryUrl}
                    disabled={saving}
                  />
                </CardContent>
              </Card>
            ) : null}

            {saveError ? (
              <T3TeamErrorState
                error={saveError}
                action="updating linked repositories"
                onRetry={() => void saveLinkedRepositories()}
              />
            ) : null}
          </div>
        </ScrollArea>

        <footer className="border-t border-border bg-card px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void saveLinkedRepositories()} disabled={saving}>
              {saving ? "Saving..." : "Save linked repositories"}
            </Button>
          </div>
        </footer>
      </Card>
    </div>
  );
}
