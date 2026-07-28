import { Loader2 } from "lucide-react";

import { Button } from "~/t3team/components/ui/t3team-button";
import type { CreateProjectStep } from "~/t3team/hooks/t3team-useCreateProject";

/**
 * Presentational per-step footer. Split out of `t3team-CreateProjectWizardFrame.tsx` so that
 * frame growth (which the split of the old "confirm" step into profile/repositories/review
 * required) stays isolated from the frame/step-transition shell.
 *
 * "repositories" is the one explicitly optional step: it gets a real "Skip" action (always
 * enabled, since nothing is required here) alongside "Continue" (enabled once at least one
 * repository is linked) rather than a single relabeled button, so skipping is never disguised as
 * finishing the step.
 */
export function CreateProjectWizardFooter({
  step,
  canContinueAccount,
  canContinueProject,
  canContinueRepositories,
  canCreateProject,
  loadingProjects,
  onBack,
  onContinueAccount,
  onContinueProject,
  onContinueProfile,
  onSkipRepositories,
  onContinueRepositories,
  onCreateProject,
}: {
  step: CreateProjectStep;
  canContinueAccount: boolean;
  canContinueProject: boolean;
  canContinueRepositories: boolean;
  canCreateProject: boolean;
  loadingProjects: boolean;
  onBack: () => void;
  onContinueAccount: () => void;
  onContinueProject: () => void;
  onContinueProfile: () => void;
  onSkipRepositories: () => void;
  onContinueRepositories: () => void;
  onCreateProject: () => void;
}) {
  // The "source" step's connect actions (OAuth primary button, API-token fallback) live in
  // the step body now — see `t3team-ConnectAtlassianStep.tsx` — so the footer has no
  // navigation to offer there, same as the terminal "creating" step.
  if (step === "creating" || step === "source") {
    return null;
  }

  return (
    <footer className="shrink-0 border-t border-border bg-card px-4 py-3">
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Button className="w-full sm:w-auto" variant="outline" onClick={onBack}>
          Back
        </Button>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
          {step === "account" ? (
            <Button
              className="w-full justify-center gap-2 sm:min-w-[11rem] sm:w-auto"
              onClick={onContinueAccount}
              disabled={!canContinueAccount || loadingProjects}
            >
              {loadingProjects ? <Loader2 className="size-4 animate-spin" /> : null}
              Continue
            </Button>
          ) : null}
          {step === "project" ? (
            <Button
              className="w-full sm:w-auto"
              onClick={onContinueProject}
              disabled={!canContinueProject}
            >
              Continue
            </Button>
          ) : null}
          {step === "profile" ? (
            <Button className="w-full sm:w-auto" onClick={onContinueProfile}>
              Continue
            </Button>
          ) : null}
          {step === "repositories" ? (
            <>
              <Button className="w-full sm:w-auto" variant="ghost" onClick={onSkipRepositories}>
                Skip
              </Button>
              <Button
                className="w-full sm:w-auto"
                onClick={onContinueRepositories}
                disabled={!canContinueRepositories}
              >
                Continue
              </Button>
            </>
          ) : null}
          {step === "review" ? (
            <Button
              className="w-full sm:w-auto"
              onClick={onCreateProject}
              disabled={!canCreateProject}
            >
              Add project
            </Button>
          ) : null}
        </div>
      </div>
    </footer>
  );
}
