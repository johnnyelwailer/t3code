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
      return <CheckCircle2Icon className="size-5 shrink-0 text-primary" aria-hidden />;
    case "active":
      return <LoaderCircleIcon className="size-5 shrink-0 animate-spin text-primary" aria-hidden />;
    case "failed":
      return <AlertCircleIcon className="size-5 shrink-0 text-destructive" aria-hidden />;
    default:
      return <CircleIcon className="size-5 shrink-0 text-muted-foreground/40" aria-hidden />;
  }
}

const isRepositoryStep = (step: SyncStep) => step.id.startsWith("repository:");

/** Consecutive repository steps form one grid block; every other step stands on its own line. */
type Block =
  | { readonly kind: "step"; readonly step: SyncStep }
  | { readonly kind: "repositories"; readonly steps: ReadonlyArray<SyncStep> };

function toBlocks(steps: ReadonlyArray<SyncStep>): ReadonlyArray<Block> {
  const blocks: Block[] = [];
  for (const step of steps) {
    const last = blocks.at(-1);
    if (isRepositoryStep(step) && last?.kind === "repositories") {
      blocks[blocks.length - 1] = { kind: "repositories", steps: [...last.steps, step] };
    } else if (isRepositoryStep(step)) {
      blocks.push({ kind: "repositories", steps: [step] });
    } else {
      blocks.push({ kind: "step", step });
    }
  }
  return blocks;
}

const detailTone = (state: SyncStepState) =>
  state === "failed" ? "text-destructive" : "text-muted-foreground";

function StepLine({ step }: { step: SyncStep }) {
  return (
    <li
      className={`flex items-start gap-3 rounded-lg px-3 py-2 ${
        step.state === "active" ? "bg-primary/5" : ""
      }`}
    >
      <StepIcon state={step.state} />
      <div className="min-w-0">
        <div
          className={`text-sm ${step.state === "pending" ? "text-muted-foreground" : "font-medium"}`}
        >
          {step.label}
        </div>
        {step.detail ? (
          <div className={`text-xs ${detailTone(step.state)}`}>{step.detail}</div>
        ) : null}
      </div>
    </li>
  );
}

function RepositoryTile({ step }: { step: SyncStep }) {
  return (
    <li
      className={`flex min-w-0 items-start gap-2.5 rounded-lg border p-3 ${
        step.state === "active"
          ? "border-primary/50 bg-primary/5"
          : step.state === "failed"
            ? "border-destructive/50"
            : "border-border"
      }`}
    >
      <StepIcon state={step.state} />
      <div className="min-w-0">
        <div
          className={`text-sm leading-snug break-words ${
            step.state === "pending" ? "text-muted-foreground" : "font-medium"
          }`}
        >
          {step.label}
        </div>
        {step.detail ? (
          <div className={`text-xs ${detailTone(step.state)}`}>{step.detail}</div>
        ) : null}
      </div>
    </li>
  );
}

/**
 * The dedicated "syncing" view of the linked-repositories dialog: every step the save goes
 * through, with the current one animated and the remaining ones listed. Repositories sit in a
 * wrapping grid so many fit on screen at once. It replaces the dialog's content in place (never a
 * second dialog on top); "Continue in background" returns to the list and leaves the sync running on the server, "Done" closes the whole dialog,
 * and after a failure "Back" returns to the repository list.
 */
export function LinkedRepositorySyncModal({
  steps,
  onContinueInBackground,
  onDone,
  onBack,
}: {
  readonly steps: ReadonlyArray<SyncStep>;
  readonly onContinueInBackground: () => void;
  readonly onDone: () => void;
  readonly onBack: () => void;
}) {
  const failed = steps.some((step) => step.state === "failed");
  const progress = describeSyncProgress(steps);
  const title = failed ? "Sync needs attention" : progress ? "Syncing repositories" : "All synced";
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-0 flex-1 flex-col"
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
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-5 pb-4">
        {toBlocks(steps).map((block) =>
          block.kind === "step" ? (
            <ol key={block.step.id}>
              <StepLine step={block.step} />
            </ol>
          ) : (
            <ul
              key={block.steps[0]?.id}
              className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-2"
            >
              {block.steps.map((step) => (
                <RepositoryTile key={step.id} step={step} />
              ))}
            </ul>
          ),
        )}
      </div>
      <footer className="flex items-center justify-end gap-2 border-t border-border px-5 py-3.5">
        {failed ? (
          <>
            <Button variant="ghost" onClick={onBack}>
              Back to repositories
            </Button>
            <Button onClick={onDone}>Close</Button>
          </>
        ) : progress ? (
          <Button onClick={onContinueInBackground}>Continue in background</Button>
        ) : (
          <Button onClick={onDone}>Done</Button>
        )}
      </footer>
    </div>
  );
}
