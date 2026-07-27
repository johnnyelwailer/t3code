import { useEffect, useMemo, useState } from "react";
import type { ProjectShellProject } from "@t3tools/project-context";
import type { T3TeamProfile } from "@t3tools/t3team-skill-packs";
import { CreateProjectDialogOAuthNotice } from "~/t3team/t3team-CreateProjectDialogOAuthNotice";
import { T3TeamErrorState } from "~/t3team/components/error/t3team-ErrorState";
import { splitRepositoryInput } from "~/t3team/components/t3team-linkedRepositories";
import { useAtlassianOAuth } from "~/t3team/hooks/t3team-useAtlassianOAuth";
import { useCreateProject } from "~/t3team/hooks/t3team-useCreateProject";
import {
  CreateProjectWizardFrame,
  CreateProjectWizardStepTransition,
  type CreateProjectWizardVariant,
} from "~/t3team/t3team-CreateProjectWizardFrame";
import {
  useT3TeamProjectSetupProfile,
  writeT3TeamProjectSetupProfile,
} from "~/t3team/t3team-projectSetupProfile";
import { AccountStep, ProjectStep } from "~/t3team/t3team-CreateProjectDialogSteps";
import { ConfirmStep, CreatingStep } from "~/t3team/t3team-CreateProjectDialogConfirmStep";
import { CreateProjectDialogFooter } from "~/t3team/t3team-CreateProjectDialogFooter";
import { ConnectAtlassianStep } from "~/t3team/t3team-ConnectAtlassianStep";
import { defaultAtlassianSiteUrlInput } from "~/t3team/hooks/t3team-createProjectUtils";

export function CreateProjectDialog({
  onClose,
  onCreated,
  variant = "dialog",
}: {
  onClose: () => void;
  onCreated: (project: ProjectShellProject) => void;
  variant?: CreateProjectWizardVariant;
}) {
  const setup = useCreateProject();
  const oauth = useAtlassianOAuth();
  const {
    loadPersistedAccounts,
    loadAccountsWithOAuth,
    projects,
    selectedAccount,
    selectedProject,
    bootstrapping,
    loadingAccounts,
    loadingProjects,
  } = setup;
  const setupProfileId = useT3TeamProjectSetupProfile();
  const [siteUrl, setSiteUrl] = useState(defaultAtlassianSiteUrlInput);
  const [email, setEmail] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [projectQuery, setProjectQuery] = useState("");
  const [linkedRepositoryUrls, setLinkedRepositoryUrls] = useState<ReadonlyArray<string>>([]);
  const [discoveredRepositoryUrls, setDiscoveredRepositoryUrls] = useState<ReadonlyArray<string>>(
    [],
  );
  const [newRepositoryUrl, setNewRepositoryUrl] = useState("");
  const [customProfile, setCustomProfile] = useState<T3TeamProfile | undefined>(undefined);
  const oauthError = oauth.state.kind === "error" ? oauth.state.message : null;
  const oauthConfigured = Boolean(__ATLASSIAN_CLIENT_ID__);

  useEffect(() => {
    void loadPersistedAccounts();
  }, [loadPersistedAccounts]);
  useEffect(() => {
    if (oauth.state.kind !== "done") return;
    void loadAccountsWithOAuth(oauth.state.sites, oauth.state.token);
  }, [oauth.state, loadAccountsWithOAuth]);

  /**
   * The server-owned flow persists the account itself, so there is no token or site list to hand
   * over — the account simply exists now and has to be read back.
   *
   * This is the path a sign-in completed in another browser takes. Without it the wizard would sit
   * on the connect step after a successful sign-in, which is exactly how it looked before: connected
   * on the server, oblivious in the UI.
   */
  useEffect(() => {
    if (oauth.state.kind !== "connected") return;
    void loadPersistedAccounts();
  }, [oauth.state, loadPersistedAccounts]);

  const filteredProjects = useMemo(() => {
    const query = projectQuery.trim().toLowerCase();
    if (!query) return projects;
    return projects.filter((project) =>
      `${project.title} ${project.key ?? ""}`.toLowerCase().includes(query),
    );
  }, [projectQuery, projects]);

  const createSelectedProject = async () => {
    if (!selectedProject) return;
    const project = await setup.createProject(selectedProject, {
      linkedRepositoryUrls,
      setupProfileId,
      ...(customProfile ? { customProfile } : {}),
    });
    onCreated(project);
  };

  const addRepository = () => {
    const normalized = splitRepositoryInput(newRepositoryUrl);
    if (normalized.length === 0) return;
    setLinkedRepositoryUrls((current) => [...new Set([...current, ...normalized])]);
    setNewRepositoryUrl("");
  };

  const removeRepository = (url: string) => {
    setLinkedRepositoryUrls((current) => current.filter((entry) => entry !== url));
  };

  const handleDiscoveredRepositoryUrlsChange = (urls: ReadonlyArray<string>) => {
    setDiscoveredRepositoryUrls(urls);
    if (urls.length === 0) return;
    setLinkedRepositoryUrls((current) => [...new Set([...current, ...urls])]);
  };

  return (
    <CreateProjectWizardFrame
      variant={variant}
      onClose={onClose}
      footer={
        <CreateProjectDialogFooter
          setup={setup}
          selectedAccount={selectedAccount}
          selectedProject={selectedProject}
          loadingProjects={loadingProjects}
          onCreateProject={createSelectedProject}
        />
      }
    >
      <div className="relative flex min-h-full flex-col gap-5 px-5 pb-5 pt-2 sm:px-6 sm:pb-6">
        <CreateProjectDialogOAuthNotice oauth={oauth} />

        {setup.error || oauthError ? (
          <T3TeamErrorState error={setup.error ?? oauthError} action="setting up the project" />
        ) : null}
        <CreateProjectWizardStepTransition step={setup.step}>
          {setup.step === "source" ? (
            <ConnectAtlassianStep
              loading={bootstrapping}
              oauthConfigured={oauthConfigured}
              oauth={oauth}
              siteUrl={siteUrl}
              email={email}
              apiToken={apiToken}
              setSiteUrl={setSiteUrl}
              setEmail={setEmail}
              setApiToken={setApiToken}
              canConnectBasic={setup.isValidUrl(siteUrl)}
              connectingBasic={loadingAccounts}
              onConnectBasic={() => void setup.loadAccountsWithBasic({ siteUrl, email, apiToken })}
            />
          ) : null}
          {setup.step === "account" ? (
            <AccountStep
              accounts={setup.accounts}
              selectedAccount={setup.selectedAccount}
              onSelectAccount={setup.setSelectedAccount}
              loading={loadingAccounts}
            />
          ) : null}
          {setup.step === "project" ? (
            <ProjectStep
              filteredProjects={filteredProjects}
              selectedProject={setup.selectedProject}
              projectQuery={projectQuery}
              setProjectQuery={setProjectQuery}
              onSelectProject={setup.setSelectedProject}
              loading={loadingProjects}
            />
          ) : null}
          {setup.step === "confirm" ? (
            <ConfirmStep
              selectedProject={selectedProject}
              setupProfileId={setupProfileId}
              linkedRepositoryUrls={linkedRepositoryUrls}
              discoveredRepositoryUrls={discoveredRepositoryUrls}
              newRepositoryUrl={newRepositoryUrl}
              setNewRepositoryUrl={setNewRepositoryUrl}
              onSetupProfileChange={writeT3TeamProjectSetupProfile}
              onAddRepository={addRepository}
              onRemoveRepository={removeRepository}
              onAddRepositories={(urls: ReadonlyArray<string>) =>
                setLinkedRepositoryUrls((current) => [...new Set([...current, ...urls])])
              }
              onDiscoveredRepositoryUrlsChange={handleDiscoveredRepositoryUrlsChange}
              customProfile={customProfile}
              onCustomProfileChange={setCustomProfile}
            />
          ) : null}
          {setup.step === "creating" ? (
            <CreatingStep
              projectTitle={selectedProject?.title}
              repositoryCount={linkedRepositoryUrls.length}
              setupProfileId={setupProfileId}
            />
          ) : null}
        </CreateProjectWizardStepTransition>
      </div>
    </CreateProjectWizardFrame>
  );
}
