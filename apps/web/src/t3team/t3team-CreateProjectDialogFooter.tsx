import { useCreateProject } from "~/t3team/hooks/t3team-useCreateProject";
import { CreateProjectWizardFooter } from "~/t3team/t3team-CreateProjectWizardFrame";
import { runT3TeamViewTransition } from "~/t3team/t3team-runViewTransition";

export function CreateProjectDialogFooter({
  setup,
  selectedAccount,
  selectedProject,
  loadingProjects,
  onCreateProject,
}: {
  setup: ReturnType<typeof useCreateProject>;
  selectedAccount: ReturnType<typeof useCreateProject>["selectedAccount"];
  selectedProject: ReturnType<typeof useCreateProject>["selectedProject"];
  loadingProjects: boolean;
  onCreateProject: () => Promise<void>;
}) {
  return (
    <CreateProjectWizardFooter
      step={setup.step}
      canContinueAccount={Boolean(selectedAccount)}
      canContinueProject={Boolean(selectedProject)}
      canCreateProject={Boolean(selectedProject)}
      loadingProjects={loadingProjects}
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
