import { WandSparklesIcon } from "lucide-react";

import { Badge } from "~/components/ui/badge";
import {
  ThreadLaunchStepRow,
  type ThreadLaunchStepPresentation,
} from "~/t3team/chat/t3team-threadLaunchSteps";
import type { T3TeamKickoffWorkflow } from "~/t3team/t3team-types";

/** Human label for a recipe's source (Epic 16 §Recipe Sources And Precedence). */
export function recipeSourceLabel(source: T3TeamKickoffWorkflow["source"]): string {
  if (source === "project-local") return "Project recipe";
  if (source === "pack") return "Pack recipe";
  return "Bundled recipe";
}

/**
 * The recipe's launch card, shown while the thread launches (pre-shell) and, for guided
 * recipes, above the open chat until the user's input arrives (post-shell).
 * `steps` carries the live per-step status; the caller decides which steps to present.
 */
export function ThreadRecipeLaunchCard({
  workflow,
  message,
  steps,
}: {
  workflow: T3TeamKickoffWorkflow;
  message: string;
  steps: ReadonlyArray<ThreadLaunchStepPresentation>;
}) {
  return (
    <div className="max-h-[min(50dvh,28rem)] overflow-x-hidden overflow-y-auto overscroll-y-contain rounded-2xl border border-border/70 bg-card px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <WandSparklesIcon className="size-4 text-primary" />
            <p className="text-sm font-semibold text-foreground">{workflow.title}</p>
          </div>
          <p className="text-sm leading-6 text-muted-foreground">{workflow.description}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="secondary">{recipeSourceLabel(workflow.source)}</Badge>
          {workflow.reason ? <Badge variant="outline">{workflow.reason}</Badge> : null}
        </div>
      </div>

      <div className="mt-3 space-y-2 rounded-xl border border-border/60 bg-muted/20 p-3">
        {steps.map((step) => (
          <ThreadLaunchStepRow key={step.label} {...step} />
        ))}
      </div>

      {message ? (
        <div className="mt-3 rounded-xl border border-border/60 bg-background/70 px-3 py-2.5">
          <p className="text-2xs font-medium uppercase tracking-widest text-muted-foreground">
            Launch instruction
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-foreground">{message}</p>
        </div>
      ) : null}
    </div>
  );
}
