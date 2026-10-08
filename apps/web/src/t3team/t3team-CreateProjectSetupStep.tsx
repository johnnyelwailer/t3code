import { RepositoryPicker } from "~/t3team/components/t3team-RepositoryPicker";
import type { GitHubDiscoveryState } from "~/t3team/hooks/t3team-useGitHubRepositoryDiscovery";

export type CreateProjectSetupStepProps = {
  discovery: GitHubDiscoveryState;
  linkedRepositoryUrls: ReadonlyArray<string>;
  onToggleRepository: (url: string) => void;
  onLinkRepositories: (urls: ReadonlyArray<string>) => void;
};

/**
 * Screen two: what to do with the project once it is picked. Working style is never asked here —
 * it is chosen once, elsewhere (see t3team-workProfileChooser.ts) — so the repository picker is
 * the whole screen, filling the pane rather than sitting in its own nested card.
 */
export function CreateProjectSetupStep(props: CreateProjectSetupStepProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 pt-4">
      <div className="text-sm font-medium">Repositories</div>
      <div className="flex min-h-0 flex-1 flex-col">
        <RepositoryPicker
          discovery={props.discovery}
          linkedUrls={props.linkedRepositoryUrls}
          onToggle={props.onToggleRepository}
          onLinkMany={props.onLinkRepositories}
        />
      </div>
    </div>
  );
}
