import type { CreateProjectStep } from "~/t3team/hooks/t3team-useCreateProject";
import { useCreateProject } from "~/t3team/hooks/t3team-useCreateProject";
import { CreateProjectWizardFooter } from "~/t3team/t3team-CreateProjectWizardFooter";
import { runT3TeamViewTransition } from "~/t3team/t3team-runViewTransition";

const BACK_TARGET: Partial<Record<CreateProjectStep, CreateProjectStep>> = {
  account: "source",
  project: "account",
  profile: "project",
  repositories: "profile",
  review: "repositories",
};

export function CreateProjectDialogFooter({
  setup,
  selectedAccount,
  selectedProject,
  loadingProjects,
  linkedRepositoryCount,
  onCreateProject,
}: {
  setup: ReturnType<typeof useCreateProject>;
  selectedAccount: ReturnType<typeof useCreateProject>["selectedAccount"];
  selectedProject: ReturnType<typeof useCreateProject>["selectedProject"];
  loadingProjects: boolean;
  linkedRepositoryCount: number;
  onCreateProject: () => Promise<void>;
}) {
  const goTo = (step: CreateProjectStep) =>
    runT3TeamViewTransition(() => setup.setStep(step), { types: ["t3team-wizard-forward"] });

  return (
    <CreateProjectWizardFooter
      step={setup.step}
      canContinueAccount={Boolean(selectedAccount)}
      canContinueProject={Boolean(selectedProject)}
      canContinueRepositories={linkedRepositoryCount > 0}
      canCreateProject={Boolean(selectedProject)}
      loadingProjects={loadingProjects}
      onBack={() => {
        runT3TeamViewTransition(
          () => {
            const target = BACK_TARGET[setup.step];
            if (target) setup.setStep(target);
          },
          { types: ["t3team-wizard-back"] },
        );
      }}
      onContinueAccount={() => {
        if (selectedAccount) {
          void setup.loadProjects(selectedAccount);
        }
      }}
      onContinueProject={() => goTo("profile")}
      onContinueProfile={() => goTo("repositories")}
      // Skip and Continue land on the same step: skipping is just leaving with whatever (if
      // anything) is already linked, never a destructive clear of state the user entered.
      onSkipRepositories={() => goTo("review")}
      onContinueRepositories={() => goTo("review")}
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
