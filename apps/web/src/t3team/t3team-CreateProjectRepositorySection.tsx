import type { ExternalProject } from "@t3tools/integrations-core";
import { ChevronDown } from "lucide-react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "~/components/ui/collapsible";

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
    <section className="space-y-3.5">
      <div className="flex items-baseline justify-between gap-3 px-1">
        <h3 className="text-base font-semibold tracking-tight">Link a repository</h3>
        <span className="text-[11px] text-muted-foreground">Optional</span>
      </div>

      <GitHubRepositoryDiscoverySection
        enabled={Boolean(selectedProject)}
        projectKey={selectedProject?.key ?? undefined}
        projectTitle={selectedProject?.title ?? undefined}
        linkedRepositoryUrls={linkedRepositoryUrls}
        onVisibleSuggestionsChange={onDiscoveredRepositoryUrlsChange}
      />
      <Collapsible defaultOpen={linkedRepositoryUrls.length > 0}>
        <CollapsibleTrigger className="flex w-full items-center justify-between border-t border-border/60 px-1 pt-3 text-left text-xs text-muted-foreground hover:text-foreground">
          <span>Enter a repository URL</span>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
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
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
