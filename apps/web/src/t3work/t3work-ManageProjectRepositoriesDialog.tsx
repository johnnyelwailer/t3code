import { useMemo, useState } from "react";
import { Link2, X } from "lucide-react";
import type { ProjectShellProject } from "@t3tools/project-context";
import { GitHubRepositoryDiscoverySection } from "~/t3work/components/t3work-GitHubRepositoryDiscoverySection";
import { LinkedRepositoryListEditor } from "~/t3work/components/t3work-LinkedRepositoryListEditor";
import { Button } from "~/t3work/components/ui/t3work-button";
import { Card, CardContent } from "~/t3work/components/ui/t3work-card";
import { ScrollArea } from "~/t3work/components/ui/t3work-scroll-area";
import { splitRepositoryInput } from "~/t3work/components/t3work-linkedRepositories";
import { useBackend } from "~/t3work/backend/t3work-index";
import {
  applyWorkspaceBootstrapToProject,
  normalizeRepositoryUrls,
  readLinkedRepositoryUrlsFromProject,
  replaceLinkedRepositoryUrlsInProject,
} from "~/t3work/hooks/t3work-createProjectBootstrap";

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
  const [newRepositoryUrl, setNewRepositoryUrl] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const addRepository = () => {
    const normalized = splitRepositoryInput(newRepositoryUrl);
    if (normalized.length === 0) return;
    setLinkedRepositoryUrls((current) => normalizeRepositoryUrls([...current, ...normalized]));
    setNewRepositoryUrl("");
  };

  const removeRepository = (url: string) => {
    setLinkedRepositoryUrls((current) => current.filter((entry) => entry !== url));
  };

  const saveLinkedRepositories = async () => {
    setSaveError(null);
    setSaving(true);
    try {
      let nextProject = replaceLinkedRepositoryUrlsInProject(project, linkedRepositoryUrls);
      if (backend && project.workspace?.rootPath) {
        const bootstrap = await backend.projectWorkspace.bootstrapWorkspace({
          workspaceRoot: project.workspace.rootPath,
          linkedRepositoryUrls,
        });
        nextProject = applyWorkspaceBootstrapToProject(nextProject, bootstrap);
        if (linkedRepositoryUrls.length === 0) {
          nextProject = replaceLinkedRepositoryUrlsInProject(nextProject, []);
        }
      }
      onProjectUpdated(nextProject);
      onClose();
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Failed to update linked repositories.",
      );
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
                  onAddSuggestedUrls={(urls) =>
                    setLinkedRepositoryUrls((current) =>
                      normalizeRepositoryUrls([...current, ...urls]),
                    )
                  }
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
                  helpText="Saving updates this project and refreshes workspace references."
                />
              </CardContent>
            </Card>

            {saveError ? (
              <Card>
                <CardContent className="p-3 text-sm text-destructive">{saveError}</CardContent>
              </Card>
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
