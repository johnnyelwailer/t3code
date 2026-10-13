import { AlertCircleIcon, CheckCircle2Icon, CircleIcon, LoaderCircleIcon } from "lucide-react";

import { Button } from "~/t3team/components/ui/t3team-button";
import {
  describeSyncProgress,
  type SyncStep,
  type SyncStepState,
} from "~/t3team/components/t3team-linkedRepositorySyncSteps";

function StepIcon({ state }: { state: SyncStepState }) {
  switch (state) {
    case "done":
      return <CheckCircle2Icon className="size-5 text-primary" aria-hidden />;
    case "active":
      return <LoaderCircleIcon className="size-5 animate-spin text-primary" aria-hidden />;
    case "failed":
      return <AlertCircleIcon className="size-5 text-destructive" aria-hidden />;
    default:
      return <CircleIcon className="size-5 text-muted-foreground/40" aria-hidden />;
  }
}

/**
 * The dedicated "syncing" view of the linked-repositories dialog: every step the save goes
 * through, with the current one animated and the remaining ones listed, so a long first clone
 * reads as progress rather than a frozen button. It covers the dialog's card; closing it
 * (`onContinueInBackground`) leaves the sync running on the server.
 */
export function LinkedRepositorySyncModal({
  steps,
  onContinueInBackground,
}: {
  readonly steps: ReadonlyArray<SyncStep>;
  readonly onContinueInBackground: () => void;
}) {
  const failed = steps.some((step) => step.state === "failed");
  const progress = describeSyncProgress(steps);
  const title = failed ? "Sync needs attention" : progress ? "Syncing repositories" : "All synced";
  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute inset-0 z-10 flex flex-col bg-card"
      data-testid="linked-repository-sync-modal"
    >
      <header className="px-5 pt-5 pb-3">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground">
          {failed
            ? "A step failed. The rest carried on."
            : (progress ?? "Everything is cloned and ready.")}
        </p>
      </header>
      <ol className="min-h-0 flex-1 space-y-1 overflow-y-auto px-5 pb-4">
        {steps.map((step) => (
          <li
            key={step.id}
            className={`flex items-start gap-3 rounded-lg px-3 py-2.5 ${
              step.state === "active" ? "bg-primary/5" : ""
            }`}
          >
            <StepIcon state={step.state} />
            <div className="min-w-0">
              <div
                className={`truncate text-sm ${
                  step.state === "pending" ? "text-muted-foreground" : "font-medium"
                }`}
              >
                {step.label}
              </div>
              {step.detail ? (
                <div
                  className={`text-xs ${
                    step.state === "failed" ? "text-destructive" : "text-muted-foreground"
                  }`}
                >
                  {step.detail}
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
      <footer className="flex items-center justify-end gap-2 border-t border-border px-5 py-3.5">
        <Button onClick={onContinueInBackground}>
          {progress && !failed ? "Continue in background" : "Done"}
        </Button>
      </footer>
    </div>
  );
}
