import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { ExternalProject } from "@t3tools/integrations-core";

import { cn } from "~/lib/utils";
import { GitHubRepositoryDiscoverySection } from "~/t3team/components/t3team-GitHubRepositoryDiscoverySection";
import { LinkedRepositoryListEditor } from "~/t3team/components/t3team-LinkedRepositoryListEditor";

/**
 * Linking repositories during project creation, collapsed by default.
 *
 * This block used to sit permanently expanded under the profile picker — a heading, a paragraph, a
 * discovery list and a repository editor — while its own copy admitted "You can add them later too".
 * A step that tells you something is skippable should not spend most of the viewport on it. Closed,
 * it is one line; opened, nothing about it has changed.
 *
 * It opens by itself once repositories are linked, so a filled-in section is never hidden behind a
 * closed disclosure.
 */
export function T3TeamCreateProjectRepositorySection({
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
  const linkedCount = linkedRepositoryUrls.length;
  const [open, setOpen] = useState(linkedCount > 0);
  const expanded = open || linkedCount > 0;

  return (
    <div className="rounded-xl border border-border/65 bg-muted/15">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={expanded}
        className="flex w-full cursor-pointer items-center gap-2 px-3 py-2.5 text-left"
      >
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-90",
          )}
          aria-hidden="true"
        />
        <span className="text-sm font-medium text-foreground">Link repositories</span>
        <span className="ml-auto text-xs text-muted-foreground">
          {linkedCount > 0
            ? `${linkedCount} linked`
            : "Optional — for code-aware suggestions"}
        </span>
      </button>

      {expanded ? (
        <div className="space-y-3 border-t border-border/60 px-3 py-3">
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
        </div>
      ) : null}
    </div>
  );
}
