import type { CreateProjectStep } from "~/t3team/hooks/t3team-useCreateProject";
import { useCreateProject } from "~/t3team/hooks/t3team-useCreateProject";
import { CreateProjectWizardFooter } from "~/t3team/t3team-CreateProjectWizardFooter";
import { runT3TeamViewTransition } from "~/t3team/t3team-runViewTransition";
import { t3teamCreateProjectWizardStepNeighbour } from "~/t3team/t3team-createProjectWizardSteps";
import { useT3TeamWorkProfileChooserEnabled } from "~/t3team/t3team-workProfileChooser";

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
  // Runtime feature flag (default off): with no chooser the wizard has no `profile` step, so
  // both directions have to route around it rather than through it.
  const chooserEnabled = useT3TeamWorkProfileChooserEnabled();
  const goTo = (step: CreateProjectStep | undefined) =>
    runT3TeamViewTransition(() => (step ? setup.setStep(step) : undefined), {
      types: ["t3team-wizard-forward"],
    });

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
            const target = t3teamCreateProjectWizardStepNeighbour(setup.step, chooserEnabled, -1);
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
      onContinueProject={() =>
        goTo(t3teamCreateProjectWizardStepNeighbour("project", chooserEnabled, 1))
      }
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
