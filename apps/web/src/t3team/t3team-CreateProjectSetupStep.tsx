import type { EnvironmentSetupProfile } from "@t3tools/contracts";
import type { T3TeamProfile } from "@t3tools/t3team-skill-packs";

import { T3TeamErrorState } from "~/t3team/components/error/t3team-ErrorState";
import { RepositoryPicker } from "~/t3team/components/t3team-RepositoryPicker";
import { ProjectAvatar } from "~/t3team/components/t3team-ProjectAvatar";
import { DialogDescription, DialogHeader, DialogTitle } from "~/t3team/components/ui/t3team-dialog";
import type { CreateProjectSubmitState } from "~/t3team/hooks/t3team-useCreateProjectSubmit";
import type { JiraCatalogProject } from "~/t3team/hooks/t3team-jiraProjectCatalog.logic";
import type { GitHubDiscoveryState } from "~/t3team/hooks/t3team-useGitHubRepositoryDiscovery";
import { CreateProjectProfileSection } from "~/t3team/t3team-CreateProjectProfileSection";
import { CreateProjectSetupFooter } from "~/t3team/t3team-CreateProjectSetupFooter";
import type { T3TeamProjectSetupProfileId } from "~/t3team/t3team-projectSetup";

export type CreateProjectSetupStepProps = {
  entry: Pick<JiraCatalogProject, "title" | "key" | "iconUrl" | "siteHost">;
  discovery: GitHubDiscoveryState;
  linkedRepositoryUrls: ReadonlyArray<string>;
  onToggleRepository: (url: string) => void;
  onLinkRepositories: (urls: ReadonlyArray<string>) => void;
  profileId: T3TeamProjectSetupProfileId;
  customProfile: T3TeamProfile | undefined;
  packProfiles: readonly EnvironmentSetupProfile[] | undefined;
  onProfileChange: (profileId: T3TeamProjectSetupProfileId) => void;
  onCustomProfileChange: (profile: T3TeamProfile | undefined) => void;
  submitState: CreateProjectSubmitState;
  onBack: () => void;
  onCreate: () => void;
};

/**
 * Screen two: what to do with the project once it is picked. Everything here has a default, so
 * "Add project" is one click away; the repository picker is the only part that usually wants a
 * look.
 */
export function CreateProjectSetupStep(props: CreateProjectSetupStepProps) {
  const { entry, submitState, linkedRepositoryUrls } = props;
  const creating = submitState.kind === "creating";

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-3 pr-8">
          <ProjectAvatar
            title={entry.title}
            projectKey={entry.key}
            iconUrl={entry.iconUrl}
            className="size-9 shrink-0 rounded-lg"
          />
          <div className="min-w-0">
            <DialogTitle>
              <span className="block truncate">{entry.title}</span>
            </DialogTitle>
            <DialogDescription>
              <span className="block truncate">
                {[entry.key, entry.siteHost].filter(Boolean).join(" · ")}
              </span>
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-4 px-5 pb-4">
        <CreateProjectProfileSection
          profileId={props.profileId}
          customProfile={props.customProfile}
          packProfiles={props.packProfiles}
          disabled={creating}
          onProfileChange={props.onProfileChange}
          onCustomProfileChange={props.onCustomProfileChange}
        />
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <div className="text-sm font-medium">
              Repositories <span className="font-normal text-muted-foreground">· optional</span>
            </div>
            <span className="text-xs text-muted-foreground">
              {linkedRepositoryUrls.length > 0 ? `${linkedRepositoryUrls.length} linked` : null}
            </span>
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border">
            <div className="flex min-h-0 flex-1 flex-col pt-3">
              <RepositoryPicker
                discovery={props.discovery}
                linkedUrls={linkedRepositoryUrls}
                onToggle={props.onToggleRepository}
                onLinkMany={props.onLinkRepositories}
              />
            </div>
          </div>
        </div>
        {submitState.kind === "error" ? (
          <T3TeamErrorState
            error={submitState.error}
            action="adding the project"
            variant="inline"
          />
        ) : null}
      </div>

      <CreateProjectSetupFooter
        creating={creating}
        failed={submitState.kind === "error"}
        onBack={props.onBack}
        onCreate={props.onCreate}
      />
    </>
  );
}
