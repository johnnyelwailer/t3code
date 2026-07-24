import { useAtlassianOAuth } from "~/t3team/hooks/t3team-useAtlassianOAuth";
import { useCreateProject } from "~/t3team/hooks/t3team-useCreateProject";
import { CreateProjectWizardFooter } from "~/t3team/t3team-CreateProjectWizardFrame";
import { runT3TeamViewTransition } from "~/t3team/t3team-runViewTransition";

export function CreateProjectDialogFooter({
  setup,
  oauth,
  siteUrl,
  email,
  apiToken,
  selectedAccount,
  selectedProject,
  bootstrapping,
  loadingProjects,
  onCreateProject,
}: {
  setup: ReturnType<typeof useCreateProject>;
  oauth: ReturnType<typeof useAtlassianOAuth>;
  siteUrl: string;
  email: string;
  apiToken: string;
  selectedAccount: ReturnType<typeof useCreateProject>["selectedAccount"];
  selectedProject: ReturnType<typeof useCreateProject>["selectedProject"];
  bootstrapping: boolean;
  loadingProjects: boolean;
  onCreateProject: () => Promise<void>;
}) {
  return (
    <CreateProjectWizardFooter
      step={setup.step}
      canConnectBasic={setup.isValidUrl(siteUrl)}
      canContinueAccount={Boolean(selectedAccount)}
      canContinueProject={Boolean(selectedProject)}
      canCreateProject={Boolean(selectedProject)}
      loadingSource={bootstrapping}
      loadingProjects={loadingProjects}
      onConnectBasic={() => void setup.loadAccountsWithBasic({ siteUrl, email, apiToken })}
      oauthLoading={
        oauth.state.kind === "opening" ||
        oauth.state.kind === "waiting" ||
        oauth.state.kind === "exchanging"
      }
      onConnectOAuth={() => void oauth.startOAuth()}
      onBack={() => {
        runT3TeamViewTransition(
          () => {
            if (setup.step === "account") {
              setup.setStep("source");
              return;
            }
            if (setup.step === "project") {
              setup.setStep("account");
              return;
            }
            setup.setStep("project");
          },
          { types: ["t3team-wizard-back"] },
        );
      }}
      onContinueAccount={() => {
        if (selectedAccount) {
          void setup.loadProjects(selectedAccount);
        }
      }}
      onContinueProject={() => {
        runT3TeamViewTransition(
          () => {
            setup.setStep("confirm");
          },
          { types: ["t3team-wizard-forward"] },
        );
      }}
      onCreateProject={() => {
        runT3TeamViewTransition(
          () => {
            void onCreateProject();
          },
          { types: ["t3team-wizard-forward"] },
        );
      }}
    />
  );
}
