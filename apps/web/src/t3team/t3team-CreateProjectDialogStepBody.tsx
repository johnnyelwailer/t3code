import type { ExternalProject } from "@t3tools/integrations-core";
import type { T3TeamProfile } from "@t3tools/t3team-skill-packs";

import type { useCreateProject } from "~/t3team/hooks/t3team-useCreateProject";
import type { UseAtlassianOAuthResult } from "~/t3team/hooks/t3team-useAtlassianOAuth";
import type { ExistingProjectMatch } from "~/t3team/hooks/t3team-useExistingProjectForExternalProject";
import type { T3TeamProjectSetupProfileId } from "~/t3team/t3team-projectSetup";
import { ConnectAtlassianStep } from "~/t3team/t3team-ConnectAtlassianStep";
import { AccountStep, ProjectStep } from "~/t3team/t3team-CreateProjectDialogSteps";
import { ProfileStep } from "~/t3team/t3team-CreateProjectDialogProfileStep";
import { RepositoriesStep } from "~/t3team/t3team-CreateProjectRepositorySection";
import { ReviewStep } from "~/t3team/t3team-CreateProjectDialogReviewStep";
import { CreatingStep } from "~/t3team/t3team-CreateProjectDialogConfirmStep";
import { CreateProjectWizardStepTransition } from "~/t3team/t3team-CreateProjectWizardFrame";

/**
 * Extracted from `t3team-CreateProjectDialog.tsx`: the per-step switch grew a `profile` and a
 * `repositories` branch when the old overloaded "confirm" step was split into three, which would
 * have pushed the dialog past its 200-line guard cap. Pure render — all state lives in the caller.
 */
export function CreateProjectDialogStepBody(props: {
  setup: ReturnType<typeof useCreateProject>;
  oauth: UseAtlassianOAuthResult;
  oauthConfigured: boolean;
  bootstrapping: boolean;
  siteUrl: string;
  setSiteUrl: (value: string) => void;
  email: string;
  setEmail: (value: string) => void;
  apiToken: string;
  setApiToken: (value: string) => void;
  loadingAccounts: boolean;
  loadingProjects: boolean;
  filteredProjects: ReadonlyArray<ExternalProject>;
  projectQuery: string;
  setProjectQuery: (value: string) => void;
  onSelectProject: (project: ExternalProject) => void;
  alreadyAdded: ReadonlyMap<string, ExistingProjectMatch>;
  onOpenExistingProject: (projectId: string) => void;
  setupProfileId: T3TeamProjectSetupProfileId;
  onSetupProfileChange: (profileId: T3TeamProjectSetupProfileId) => void;
  customProfile?: T3TeamProfile | undefined;
  onCustomProfileChange: (profile: T3TeamProfile | undefined) => void;
  linkedRepositoryUrls: ReadonlyArray<string>;
  discoveredRepositoryUrls: ReadonlyArray<string>;
  newRepositoryUrl: string;
  setNewRepositoryUrl: (value: string) => void;
  onAddRepository: () => void;
  onRemoveRepository: (url: string) => void;
  onAddRepositories: (urls: ReadonlyArray<string>) => void;
  onDiscoveredRepositoryUrlsChange: (urls: ReadonlyArray<string>) => void;
}) {
  const { setup } = props;

  return (
    <CreateProjectWizardStepTransition step={setup.step}>
      {setup.step === "source" ? (
        <ConnectAtlassianStep
          loading={props.bootstrapping}
          oauthConfigured={props.oauthConfigured}
          oauth={props.oauth}
          siteUrl={props.siteUrl}
          email={props.email}
          apiToken={props.apiToken}
          setSiteUrl={props.setSiteUrl}
          setEmail={props.setEmail}
          setApiToken={props.setApiToken}
          canConnectBasic={setup.isValidUrl(props.siteUrl)}
          connectingBasic={props.loadingAccounts}
          onConnectBasic={() =>
            void setup.loadAccountsWithBasic({
              siteUrl: props.siteUrl,
              email: props.email,
              apiToken: props.apiToken,
            })
          }
        />
      ) : null}
      {setup.step === "account" ? (
        <AccountStep
          accounts={setup.accounts}
          selectedAccount={setup.selectedAccount}
          onSelectAccount={setup.setSelectedAccount}
          loading={props.loadingAccounts}
        />
      ) : null}
      {setup.step === "project" ? (
        <ProjectStep
          filteredProjects={props.filteredProjects}
          selectedProject={setup.selectedProject}
          projectQuery={props.projectQuery}
          setProjectQuery={props.setProjectQuery}
          onSelectProject={props.onSelectProject}
          loading={props.loadingProjects}
          alreadyAdded={props.alreadyAdded}
          onOpenExistingProject={props.onOpenExistingProject}
        />
      ) : null}
      {setup.step === "profile" ? (
        <ProfileStep
          setupProfileId={props.setupProfileId}
          onSetupProfileChange={props.onSetupProfileChange}
          customProfile={props.customProfile}
          onCustomProfileChange={props.onCustomProfileChange}
        />
      ) : null}
      {setup.step === "repositories" ? (
        <RepositoriesStep
          selectedProject={setup.selectedProject}
          linkedRepositoryUrls={props.linkedRepositoryUrls}
          discoveredRepositoryUrls={props.discoveredRepositoryUrls}
          newRepositoryUrl={props.newRepositoryUrl}
          setNewRepositoryUrl={props.setNewRepositoryUrl}
          onAddRepository={props.onAddRepository}
          onRemoveRepository={props.onRemoveRepository}
          onAddRepositories={props.onAddRepositories}
          onDiscoveredRepositoryUrlsChange={props.onDiscoveredRepositoryUrlsChange}
        />
      ) : null}
      {setup.step === "review" ? (
        <ReviewStep
          setupProfileId={props.setupProfileId}
          customProfile={props.customProfile}
          linkedRepositoryUrls={props.linkedRepositoryUrls}
          selectedAccount={setup.selectedAccount}
          projectTitle={setup.selectedProject?.title}
        />
      ) : null}
      {setup.step === "creating" ? (
        <CreatingStep
          projectTitle={setup.selectedProject?.title}
          repositoryCount={props.linkedRepositoryUrls.length}
          setupProfileId={props.setupProfileId}
        />
      ) : null}
    </CreateProjectWizardStepTransition>
  );
}
