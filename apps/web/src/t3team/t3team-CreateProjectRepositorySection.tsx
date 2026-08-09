import type { ExternalProject } from "@t3tools/integrations-core";

import { GitHubRepositoryDiscoverySection } from "~/t3team/components/t3team-GitHubRepositoryDiscoverySection";
import { LinkedRepositoryListEditor } from "~/t3team/components/t3team-LinkedRepositoryListEditor";

/**
 * Body of the wizard's "repositories" step.
 *
 * This used to be a closed-by-default disclosure sitting under the profile picker on the
 * overloaded "confirm" step, its own copy admitting "You can add them later too". Now that linking
 * repositories is its own explicitly optional step (see the "Skip" action in
 * `t3team-CreateProjectWizardFooter.tsx`), there is nothing left to collapse: the whole step
 * already says this is skippable, so it can just show the controls directly.
 */
export function RepositoriesStep({
  selectedProject,
  linkedRepositoryUrls,
  discoveredRepositoryUrls,
  newRepositoryUrl,
  setNewRepositoryUrl,
  onAddRepository,
  onRemoveRepository,
  onAddRepositories,
  onDiscoveredRepositoryUrlsChange,
}: {
  readonly selectedProject: ExternalProject | null;
  readonly linkedRepositoryUrls: ReadonlyArray<string>;
  readonly discoveredRepositoryUrls: ReadonlyArray<string>;
  readonly newRepositoryUrl: string;
  readonly setNewRepositoryUrl: (value: string) => void;
  readonly onAddRepository: () => void;
  readonly onRemoveRepository: (url: string) => void;
  readonly onAddRepositories: (urls: ReadonlyArray<string>) => void;
  readonly onDiscoveredRepositoryUrlsChange: (urls: ReadonlyArray<string>) => void;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">Link repositories</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Optional — link GitHub or GHE repositories so agents get context from code. Skip this and
          add them later from the project.
        </p>
      </div>

      <GitHubRepositoryDiscoverySection
        enabled={Boolean(selectedProject)}
        projectKey={selectedProject?.key ?? undefined}
        projectTitle={selectedProject?.title ?? undefined}
        linkedRepositoryUrls={linkedRepositoryUrls}
        onAddSuggestedUrls={onAddRepositories}
        onVisibleSuggestionsChange={onDiscoveredRepositoryUrlsChange}
      />
      <LinkedRepositoryListEditor
        repositoryUrls={linkedRepositoryUrls}
        newRepositoryUrl={newRepositoryUrl}
        setNewRepositoryUrl={setNewRepositoryUrl}
        onAddRepository={onAddRepository}
        onRemoveRepository={onRemoveRepository}
        onAddSearchableOption={(url) => onAddRepositories([url])}
        searchableRepositoryOptions={discoveredRepositoryUrls}
        emptyMessage="Add GitHub or GHE repositories to give agents context from code."
      />
    </section>
  );
}
