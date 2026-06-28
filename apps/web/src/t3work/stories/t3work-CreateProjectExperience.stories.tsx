import { useEffect, useMemo, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import type { ExternalProject, IntegrationAccount } from "@t3tools/integrations-core";
import { Button } from "~/t3work/components/ui/t3work-button";
import { LinkedRepositoryListEditor } from "~/t3work/components/t3work-LinkedRepositoryListEditor";
import { AccountStep, ProjectStep, SourceStep } from "~/t3work/t3work-CreateProjectDialogSteps";
import { CreatingStep } from "~/t3work/t3work-CreateProjectDialogConfirmStep";
import {
  CreateProjectWizardFooter,
  CreateProjectWizardFrame,
  CreateProjectWizardStepTransition,
} from "~/t3work/t3work-CreateProjectWizardFrame";
import { T3workProjectSetupProfileCards } from "~/t3work/t3work-ProjectSetupProfileCards";
import { T3workSetupWelcomeSurface } from "~/t3work/t3work-SetupWelcomeSurface";
import { runT3workViewTransition } from "~/t3work/t3work-runViewTransition";
import {
  useT3workProjectSetupProfile,
  writeT3workProjectSetupProfile,
} from "~/t3work/t3work-projectSetupProfile";
import type { CreateProjectStep } from "~/t3work/hooks/t3work-useCreateProject";

const accounts: ReadonlyArray<IntegrationAccount> = [
  {
    id: "site-acme",
    provider: "atlassian",
    label: "Acme Product",
    accountUrl: "https://acme.atlassian.net",
  },
  {
    id: "site-ops",
    provider: "atlassian",
    label: "Acme Ops",
    accountUrl: "https://ops.acme.atlassian.net",
  },
];

const projects: ReadonlyArray<ExternalProject> = [
  { id: "mobile-checkout", provider: "atlassian", title: "Mobile Checkout", key: "MOB", raw: {} },
  { id: "jira-uplift", provider: "atlassian", title: "Jira Uplift", key: "OPS", raw: {} },
  {
    id: "workspace-rollout",
    provider: "atlassian",
    title: "Workspace Rollout",
    key: "WRK",
    raw: {},
  },
];

function transition(update: () => void, direction: "forward" | "back") {
  runT3workViewTransition(update, { types: [`t3work-wizard-${direction}`] });
}

function CreateProjectExperienceStory({ autoAdvance = false }: { autoAdvance?: boolean }) {
  const setupProfileId = useT3workProjectSetupProfile();
  const [showWizard, setShowWizard] = useState(false);
  const [step, setStep] = useState<CreateProjectStep>("source");
  const [siteUrl, setSiteUrl] = useState("https://acme.atlassian.net");
  const [email, setEmail] = useState("owner@acme.test");
  const [apiToken, setApiToken] = useState("storybook-demo-token");
  const [selectedAccount, setSelectedAccount] = useState<IntegrationAccount | null>(
    accounts[0] ?? null,
  );
  const [selectedProject, setSelectedProject] = useState<ExternalProject | null>(
    projects[0] ?? null,
  );
  const [projectQuery, setProjectQuery] = useState("");
  const [newRepositoryUrl, setNewRepositoryUrl] = useState("");
  const [repositoryUrls, setRepositoryUrls] = useState<ReadonlyArray<string>>([
    "https://github.com/acme/mobile-checkout",
  ]);
  const [supportsTransition, setSupportsTransition] = useState(false);

  useEffect(() => {
    setSupportsTransition(
      typeof document !== "undefined" && typeof document.startViewTransition === "function",
    );
  }, []);

  const filteredProjects = useMemo(() => {
    const query = projectQuery.trim().toLowerCase();
    if (!query) return projects;
    return projects.filter((project) =>
      `${project.title} ${project.key ?? ""}`.toLowerCase().includes(query),
    );
  }, [projectQuery]);

  const openWizard = () =>
    transition(() => {
      setShowWizard(true);
      setStep("source");
    }, "forward");
  const closeWizard = () =>
    transition(() => {
      setShowWizard(false);
      setStep("source");
    }, "back");
  const goBack = () =>
    transition(() => {
      if (step === "account") setStep("source");
      else if (step === "project") setStep("account");
      else if (step === "confirm") setStep("project");
    }, "back");
  const goForward = () =>
    transition(() => {
      if (step === "source") setStep("account");
      else if (step === "account") setStep("project");
      else if (step === "project") setStep("confirm");
      else if (step === "confirm") setStep("creating");
    }, "forward");

  useEffect(() => {
    if (!autoAdvance) return;
    const timer = window.setTimeout(() => {
      if (!showWizard) openWizard();
      else if (step === "creating") closeWizard();
      else goForward();
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [autoAdvance, showWizard, step]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 bg-card/90 px-4 py-3">
        <div>
          <div className="text-sm font-semibold">First-run setup transition harness</div>
          <div className="text-xs text-muted-foreground">
            Native support: {supportsTransition ? "available" : "unavailable"}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setProjectQuery("");
              setSelectedAccount(accounts[0] ?? null);
              setSelectedProject(projects[0] ?? null);
              closeWizard();
            }}
          >
            Reset
          </Button>
          <Button variant="outline" onClick={showWizard ? closeWizard : openWizard}>
            {showWizard ? "Close wizard" : "Open wizard"}
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <div
          key={showWizard ? "wizard" : "welcome"}
          className="flex h-full min-h-0 [view-transition-name:t3work-create-project-entry-surface]"
        >
          {showWizard ? (
            <CreateProjectWizardFrame
              variant="inline"
              onClose={closeWizard}
              footer={
                <CreateProjectWizardFooter
                  step={step}
                  canConnectBasic={siteUrl.startsWith("https://")}
                  canContinueAccount={Boolean(selectedAccount)}
                  canContinueProject={Boolean(selectedProject)}
                  canCreateProject={Boolean(selectedProject)}
                  loadingSource={false}
                  loadingProjects={false}
                  onConnectBasic={goForward}
                  onConnectOAuth={goForward}
                  onBack={goBack}
                  onContinueAccount={goForward}
                  onContinueProject={goForward}
                  onCreateProject={goForward}
                />
              }
            >
              <div className="relative space-y-5 px-5 pb-5 pt-2 sm:px-6 sm:pb-6">
                <CreateProjectWizardStepTransition step={step}>
                  {step === "source" ? (
                    <SourceStep
                      loading={false}
                      siteUrl={siteUrl}
                      email={email}
                      apiToken={apiToken}
                      setSiteUrl={setSiteUrl}
                      setEmail={setEmail}
                      setApiToken={setApiToken}
                    />
                  ) : null}
                  {step === "account" ? (
                    <AccountStep
                      accounts={accounts}
                      selectedAccount={selectedAccount}
                      onSelectAccount={setSelectedAccount}
                      loading={false}
                    />
                  ) : null}
                  {step === "project" ? (
                    <ProjectStep
                      filteredProjects={filteredProjects}
                      selectedProject={selectedProject}
                      projectQuery={projectQuery}
                      setProjectQuery={setProjectQuery}
                      onSelectProject={setSelectedProject}
                      loading={false}
                    />
                  ) : null}
                  {step === "confirm" ? (
                    <section className="space-y-6">
                      <div className="space-y-2">
                        <h3 className="text-sm font-semibold">How should Nexi AI work with you?</h3>
                        <p className="text-xs text-muted-foreground">
                          This Storybook step keeps setup local so you can judge the transition
                          without backend noise.
                        </p>
                      </div>
                      <T3workProjectSetupProfileCards
                        compact
                        selectedProfileId={setupProfileId}
                        onSelectProfile={writeT3workProjectSetupProfile}
                      />
                      <LinkedRepositoryListEditor
                        repositoryUrls={repositoryUrls}
                        newRepositoryUrl={newRepositoryUrl}
                        setNewRepositoryUrl={setNewRepositoryUrl}
                        onAddRepository={() => {
                          const normalized = newRepositoryUrl.trim();
                          if (!normalized) return;
                          setRepositoryUrls((current) => [...new Set([...current, normalized])]);
                          setNewRepositoryUrl("");
                        }}
                        onRemoveRepository={(url) =>
                          setRepositoryUrls((current) => current.filter((entry) => entry !== url))
                        }
                        helpText="Use this isolated step to check confirm-step spacing and motion without GitHub discovery state."
                      />
                    </section>
                  ) : null}
                  {step === "creating" ? (
                    <CreatingStep
                      projectTitle={selectedProject?.title}
                      repositoryCount={repositoryUrls.length}
                      setupProfileId={setupProfileId}
                    />
                  ) : null}
                </CreateProjectWizardStepTransition>
              </div>
            </CreateProjectWizardFrame>
          ) : (
            <T3workSetupWelcomeSurface onCreate={openWizard} />
          )}
        </div>
      </div>
    </div>
  );
}

const meta = {
  title: "T3work/First Run/Create Project Experience",
  component: CreateProjectExperienceStory,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof CreateProjectExperienceStory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Manual: Story = {
  args: {
    autoAdvance: false,
  },
};

export const AutoAdvance: Story = {
  args: {
    autoAdvance: true,
  },
};

export const Mobile: Story = {
  args: {
    autoAdvance: false,
  },
  parameters: {
    viewport: {
      defaultViewport: "phone",
    },
  },
};
