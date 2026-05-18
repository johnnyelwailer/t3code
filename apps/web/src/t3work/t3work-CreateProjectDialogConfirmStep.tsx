import { Loader2 } from "lucide-react";
import type { ExternalProject } from "@t3tools/integrations-core";
import { GitHubRepositoryDiscoverySection } from "~/t3work/components/t3work-GitHubRepositoryDiscoverySection";
import { LinkedRepositoryListEditor } from "~/t3work/components/t3work-LinkedRepositoryListEditor";

export function ConfirmStep({
  selectedProject,
  linkedRepositoryUrls,
  newRepositoryUrl,
  setNewRepositoryUrl,
  onAddRepository,
  onRemoveRepository,
  onAddRepositories,
}: {
  selectedProject: ExternalProject | null;
  linkedRepositoryUrls: ReadonlyArray<string>;
  newRepositoryUrl: string;
  setNewRepositoryUrl: (value: string) => void;
  onAddRepository: () => void;
  onRemoveRepository: (url: string) => void;
  onAddRepositories: (urls: ReadonlyArray<string>) => void;
}) {
  return (
    <section className="space-y-3">
      <GitHubRepositoryDiscoverySection
        enabled={Boolean(selectedProject)}
        projectKey={selectedProject?.key ?? undefined}
        projectTitle={selectedProject?.title ?? undefined}
        linkedRepositoryUrls={linkedRepositoryUrls}
        onAddSuggestedUrls={onAddRepositories}
      />
      <LinkedRepositoryListEditor
        repositoryUrls={linkedRepositoryUrls}
        newRepositoryUrl={newRepositoryUrl}
        setNewRepositoryUrl={setNewRepositoryUrl}
        onAddRepository={onAddRepository}
        onRemoveRepository={onRemoveRepository}
        emptyMessage="No linked repositories yet. Add GitHub or GHE repositories if you want agent context from code."
        helpText="Linked repositories provide code context for agents and can be managed later from the project dashboard."
      />
    </section>
  );
}

export function CreatingStep() {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" />
      Creating project...
    </div>
  );
}
