import { Loader2 } from "lucide-react";
import type { ExternalProject } from "@t3tools/integrations-core";
import { T3TeamCreateProjectRepositorySection } from "~/t3team/t3team-CreateProjectRepositorySection";
import {
  listT3TeamProjectSetupCardOptions,
  T3TeamProjectSetupProfileCards,
} from "~/t3team/t3team-ProjectSetupProfileCards";
import { T3TeamCloneProjectSetupProfileDialog } from "~/t3team/t3team-CloneProjectSetupProfileDialog";
import { T3TeamProjectSetupConfirmPreviewView } from "~/t3team/t3team-ProjectSetupConfirmPreviewView";
import { useT3TeamPackSetupProfiles } from "~/t3team/t3team-packSetupProfiles";
import type { T3TeamProjectSetupProfileId } from "~/t3team/t3team-projectSetup";
import type { T3TeamProfile } from "@t3tools/t3team-skill-packs";

export function ConfirmStep({
  selectedProject,
  setupProfileId,
  linkedRepositoryUrls,
  discoveredRepositoryUrls,
  newRepositoryUrl,
  setNewRepositoryUrl,
  onSetupProfileChange,
  onAddRepository,
  onRemoveRepository,
  onAddRepositories,
  onDiscoveredRepositoryUrlsChange,
  customProfile,
  onCustomProfileChange,
}: {
  selectedProject: ExternalProject | null;
  setupProfileId: T3TeamProjectSetupProfileId;
  linkedRepositoryUrls: ReadonlyArray<string>;
  discoveredRepositoryUrls: ReadonlyArray<string>;
  newRepositoryUrl: string;
  setNewRepositoryUrl: (value: string) => void;
  onSetupProfileChange: (profileId: T3TeamProjectSetupProfileId) => void;
  onAddRepository: () => void;
  onRemoveRepository: (url: string) => void;
  onAddRepositories: (urls: ReadonlyArray<string>) => void;
  onDiscoveredRepositoryUrlsChange: (urls: ReadonlyArray<string>) => void;
  customProfile?: T3TeamProfile | undefined;
  onCustomProfileChange: (profile: T3TeamProfile | undefined) => void;
}) {
  const packProfiles = useT3TeamPackSetupProfiles();

  /*
    One decision, stated once. The heading used to carry a subtitle explaining that it set "the
    default tone" — the cards below say that better than a sentence above them can. What follows the
    cards is consequence and optional extras, both collapsed, so the choice itself fits the dialog
    without scrolling.
  */
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">How should t3team work with you?</h3>
        <T3TeamCloneProjectSetupProfileDialog
          sourceProfileId={setupProfileId}
          onClone={(profile) => {
            onCustomProfileChange(profile);
            onSetupProfileChange(profile.id);
          }}
        />
      </div>

      <T3TeamProjectSetupProfileCards
        compact
        selectedProfileId={setupProfileId}
        onSelectProfile={(profileId) => {
          onCustomProfileChange(undefined);
          onSetupProfileChange(profileId);
        }}
        profiles={packProfiles}
      />

      <T3TeamProjectSetupConfirmPreviewView
        profileId={setupProfileId}
        {...(customProfile ? { customProfile } : {})}
      />

      <T3TeamCreateProjectRepositorySection
        selectedProject={selectedProject}
        linkedRepositoryUrls={linkedRepositoryUrls}
        discoveredRepositoryUrls={discoveredRepositoryUrls}
        newRepositoryUrl={newRepositoryUrl}
        setNewRepositoryUrl={setNewRepositoryUrl}
        onAddRepository={onAddRepository}
        onRemoveRepository={onRemoveRepository}
        onAddRepositories={onAddRepositories}
        onDiscoveredRepositoryUrlsChange={onDiscoveredRepositoryUrlsChange}
      />
    </section>
  );
}

export function CreatingStep({
  projectTitle,
  repositoryCount,
  setupProfileId,
}: {
  projectTitle: string | undefined;
  repositoryCount: number;
  setupProfileId: T3TeamProjectSetupProfileId;
}) {
  const packProfiles = useT3TeamPackSetupProfiles();
  const title = projectTitle ?? "project";
  const setupProfileTitle =
    listT3TeamProjectSetupCardOptions(packProfiles).find((option) => option.id === setupProfileId)
      ?.title ?? "Project Partner";

  return (
    <section className="flex min-h-[18rem] items-center justify-center px-2 py-6 sm:min-h-[22rem]">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card px-6 py-7 shadow-sm">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary/20 via-primary to-primary/20" />
        <div className="flex flex-col items-center text-center">
          <div className="mb-5 flex size-14 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary">
            <Loader2 className="size-6 animate-spin" />
          </div>
          <h3 className="text-base font-semibold">Creating {title}</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            We&apos;re provisioning the workspace and tailoring it for the {setupProfileTitle}
            profile.
          </p>
        </div>

        <div className="mt-6 space-y-3 text-left">
          {[
            "Preparing the managed workspace",
            `Applying the ${setupProfileTitle} setup`,
            repositoryCount > 0
              ? `Linking ${repositoryCount} repository${repositoryCount === 1 ? "" : "ies"}`
              : "No repositories selected yet",
            "Finalizing the project shell",
          ].map((label) => (
            <div
              key={label}
              className="flex items-center gap-3 rounded-lg border border-border/70 px-3 py-2"
            >
              <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                <span className="size-2.5 rounded-full bg-current" />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-medium">{label}</div>
                <div className="text-xs text-muted-foreground">In progress</div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-lg border border-dashed border-border/80 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          This usually takes a few seconds. Keep this window open while the project is created.
        </div>
      </div>
    </section>
  );
}
