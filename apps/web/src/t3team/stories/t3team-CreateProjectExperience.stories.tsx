import { useEffect, useMemo, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import type { ExternalProject, IntegrationAccount } from "@t3tools/integrations-core";
import { Button } from "~/t3team/components/ui/t3team-button";
import { LinkedRepositoryListEditor } from "~/t3team/components/t3team-LinkedRepositoryListEditor";
import { OAuthPopupBlockedNotice } from "~/t3team/components/t3team-OAuthPopupBlockedNotice";
import { AccountStep, ProjectStep } from "~/t3team/t3team-CreateProjectDialogSteps";
import { ConnectAtlassianStep } from "~/t3team/t3team-ConnectAtlassianStep";
import { ConfirmStep, CreatingStep } from "~/t3team/t3team-CreateProjectDialogConfirmStep";
import {
  CreateProjectWizardFooter,
  CreateProjectWizardFrame,
  CreateProjectWizardStepTransition,
} from "~/t3team/t3team-CreateProjectWizardFrame";
import { T3TeamProjectSetupProfileCards } from "~/t3team/t3team-ProjectSetupProfileCards";
import { T3TeamSetupWelcomeSurface } from "~/t3team/t3team-SetupWelcomeSurface";
import { runT3TeamViewTransition } from "~/t3team/t3team-runViewTransition";
import {
  useT3TeamProjectSetupProfile,
  writeT3TeamProjectSetupProfile,
} from "~/t3team/t3team-projectSetupProfile";
import {
  DEFAULT_T3TEAM_PROJECT_SETUP_PROFILE_ID,
  type T3TeamProjectSetupProfileId,
} from "~/t3team/t3team-projectSetup";
import type { CreateProjectStep } from "~/t3team/hooks/t3team-useCreateProject";
import type { OAuthState, UseAtlassianOAuthResult } from "~/t3team/hooks/t3team-useAtlassianOAuth";

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
  runT3TeamViewTransition(update, { types: [`t3team-wizard-${direction}`] });
}

function CreateProjectExperienceStory({ autoAdvance = false }: { autoAdvance?: boolean }) {
  const setupProfileId = useT3TeamProjectSetupProfile();
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
  const demoOauth: UseAtlassianOAuthResult = useMemo(
    () => ({
      state: { kind: "idle" },
      startOAuth: async () => goForward(),
      mintFreshSigninLink: async () => "",
      reset: () => {},
    }),
    [step],
  );

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
          className="flex h-full min-h-0 [view-transition-name:t3team-create-project-entry-surface]"
        >
          {showWizard ? (
            <CreateProjectWizardFrame
              variant="inline"
              onClose={closeWizard}
              footer={
                <CreateProjectWizardFooter
                  step={step}
                  canContinueAccount={Boolean(selectedAccount)}
                  canContinueProject={Boolean(selectedProject)}
                  canCreateProject={Boolean(selectedProject)}
                  loadingProjects={false}
                  onBack={goBack}
                  onContinueAccount={goForward}
                  onContinueProject={goForward}
                  onCreateProject={goForward}
                />
              }
            >
              <div className="relative flex min-h-full flex-col gap-5 px-5 pb-5 pt-2 sm:px-6 sm:pb-6">
                <CreateProjectWizardStepTransition step={step}>
                  {step === "source" ? (
                    <ConnectAtlassianStep
                      loading={false}
                      oauthConfigured
                      oauth={demoOauth}
                      siteUrl={siteUrl}
                      email={email}
                      apiToken={apiToken}
                      setSiteUrl={setSiteUrl}
                      setEmail={setEmail}
                      setApiToken={setApiToken}
                      canConnectBasic={siteUrl.startsWith("https://")}
                      connectingBasic={false}
                      onConnectBasic={goForward}
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
                        <h3 className="text-sm font-semibold">How should t3team work with you?</h3>
                        <p className="text-xs text-muted-foreground">
                          This Storybook step keeps setup local so you can judge the transition
                          without backend noise.
                        </p>
                      </div>
                      <T3TeamProjectSetupProfileCards
                        compact
                        selectedProfileId={setupProfileId}
                        onSelectProfile={writeT3TeamProjectSetupProfile}
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
            <T3TeamSetupWelcomeSurface onCreate={openWizard} />
          )}
        </div>
      </div>
    </div>
  );
}

const meta = {
  title: "T3Team/First Run/Create Project Experience",
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

/**
 * The profile step on its own, inside a real dialog-height frame.
 *
 * It reached the user overloaded — six cards, an expanded setup preview and a permanently expanded
 * repository section, in a dialog capped at 40rem — because no story rendered it at the height it
 * actually gets. Driving the full wizard to step four by hand is exactly the friction that stops a
 * step from being looked at.
 */
function ConfirmStepStory() {
  const [setupProfileId, setSetupProfileId] = useState<T3TeamProjectSetupProfileId>(
    DEFAULT_T3TEAM_PROJECT_SETUP_PROFILE_ID,
  );
  const [linkedRepositoryUrls, setLinkedRepositoryUrls] = useState<ReadonlyArray<string>>([]);
  const [discovered, setDiscovered] = useState<ReadonlyArray<string>>([]);
  const [newRepositoryUrl, setNewRepositoryUrl] = useState("");

  return (
    <div className="flex h-dvh items-center justify-center bg-background p-6">
      <div className="flex h-[min(40rem,calc(100dvh-3rem))] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-card">
        <div className="border-b border-border px-5 py-3 text-sm font-semibold">Create project</div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <ConfirmStep
            selectedProject={projects[0] ?? null}
            setupProfileId={setupProfileId}
            linkedRepositoryUrls={linkedRepositoryUrls}
            discoveredRepositoryUrls={discovered}
            newRepositoryUrl={newRepositoryUrl}
            setNewRepositoryUrl={setNewRepositoryUrl}
            onSetupProfileChange={setSetupProfileId}
            onAddRepository={() => {
              if (newRepositoryUrl.trim() === "") return;
              setLinkedRepositoryUrls((current) => [...current, newRepositoryUrl.trim()]);
              setNewRepositoryUrl("");
            }}
            onRemoveRepository={(url) =>
              setLinkedRepositoryUrls((current) => current.filter((entry) => entry !== url))
            }
            onAddRepositories={(urls) =>
              setLinkedRepositoryUrls((current) => [...new Set([...current, ...urls])])
            }
            onDiscoveredRepositoryUrlsChange={setDiscovered}
            onCustomProfileChange={() => undefined}
          />
        </div>
        <div className="border-t border-border px-5 py-3 text-right text-xs text-muted-foreground">
          Footer sits here — the step above must fit without pushing it off screen.
        </div>
      </div>
    </div>
  );
}

export const ConfirmStepInDialog: StoryObj = {
  render: () => <ConfirmStepStory />,
  parameters: { layout: "fullscreen" },
};

const IDLE_OAUTH_STATE: OAuthState = { kind: "idle" };

/**
 * Isolated harness for the "source" step's connect UI, independent of the multi-step
 * transition demo above. Lets each Atlassian-connect state (default, revealed fallback,
 * in-flight, popup-blocked, unconfigured) be screenshotted on its own.
 */
function ConnectAtlassianStepHarness({
  oauthState = IDLE_OAUTH_STATE,
  oauthConfigured = true,
  initialShowTokenForm = false,
}: {
  oauthState?: OAuthState;
  oauthConfigured?: boolean;
  initialShowTokenForm?: boolean;
}) {
  const [siteUrl, setSiteUrl] = useState("https://acme.atlassian.net");
  const [email, setEmail] = useState("owner@acme.test");
  const [apiToken, setApiToken] = useState("");
  const oauth: UseAtlassianOAuthResult = {
    state: oauthState,
    startOAuth: async () => {},
    mintFreshSigninLink: async () => "",
    reset: () => {},
  };

  return (
    // Height approximates the real dialog's body (~40rem card minus header chrome), so the
    // step's internal vertical centering renders the same way it does in the live wizard.
    <div className="mx-auto flex h-[36rem] max-w-md flex-col gap-4 rounded-2xl border border-border/70 bg-card p-6">
      {oauthState.kind === "needs_manual_open" ? (
        <OAuthPopupBlockedNotice
          signinUrl={oauthState.signinUrl}
          expired={oauthState.expired ?? false}
          onLinkUsed={() => {}}
          onCancel={() => {}}
        />
      ) : null}
      <ConnectAtlassianStep
        loading={false}
        oauthConfigured={oauthConfigured}
        oauth={oauth}
        siteUrl={siteUrl}
        email={email}
        apiToken={apiToken}
        setSiteUrl={setSiteUrl}
        setEmail={setEmail}
        setApiToken={setApiToken}
        canConnectBasic={siteUrl.startsWith("https://")}
        connectingBasic={false}
        onConnectBasic={() => {}}
        initialShowTokenForm={initialShowTokenForm}
      />
    </div>
  );
}

export const ConnectAtlassianDefault: Story = {
  render: () => <ConnectAtlassianStepHarness />,
};

export const ConnectAtlassianTokenFallbackRevealed: Story = {
  render: () => <ConnectAtlassianStepHarness initialShowTokenForm />,
};

export const ConnectAtlassianInFlight: Story = {
  render: () => <ConnectAtlassianStepHarness oauthState={{ kind: "opening" }} />,
};

export const ConnectAtlassianPopupBlocked: Story = {
  render: () => (
    <ConnectAtlassianStepHarness
      oauthState={{
        kind: "needs_manual_open",
        // The shareable server-flow link, which is what the notice offers in practice.
        signinUrl: "http://localhost:5736/api/t3team/atlassian/oauth/begin/8f14e45fceea167a",
      }}
    />
  ),
};

export const ConnectAtlassianLinkExpired: Story = {
  render: () => (
    <ConnectAtlassianStepHarness
      oauthState={{
        kind: "needs_manual_open",
        signinUrl: "http://localhost:5736/api/t3team/atlassian/oauth/begin/8f14e45fceea167a",
        // Seen pending, then unknown: the status poll reported this exact link can no longer finish.
        expired: true,
      }}
    />
  ),
};

export const ConnectAtlassianUnconfigured: Story = {
  render: () => <ConnectAtlassianStepHarness oauthConfigured={false} />,
};
