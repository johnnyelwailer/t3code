import { useAtlassianOAuth } from "~/t3work/hooks/t3work-useAtlassianOAuth";
import { useCreateProject } from "~/t3work/hooks/t3work-useCreateProject";
import { CreateProjectWizardFooter } from "~/t3work/t3work-CreateProjectWizardFrame";
import { runT3workViewTransition } from "~/t3work/t3work-runViewTransition";

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
        runT3workViewTransition(
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
          { types: ["t3work-wizard-back"] },
        );
      }}
      onContinueAccount={() => {
        if (selectedAccount) {
          void setup.loadProjects(selectedAccount);
        }
      }}
      onContinueProject={() => {
        runT3workViewTransition(
          () => {
            setup.setStep("confirm");
          },
          { types: ["t3work-wizard-forward"] },
        );
      }}
      onCreateProject={() => {
        runT3workViewTransition(
          () => {
            void onCreateProject();
          },
          { types: ["t3work-wizard-forward"] },
        );
      }}
    />
  );
}
