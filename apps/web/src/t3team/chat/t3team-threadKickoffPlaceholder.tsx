import { hasGuidedKickoffInputStep } from "~/t3team/t3team-recipeKickoffProgram";
import type { ThreadLaunchStepPresentation } from "~/t3team/chat/t3team-threadBootstrapProgress";
import { ThreadRecipeLaunchCard } from "~/t3team/chat/t3team-threadRecipeLaunchCard";
import type { T3TeamKickoffWorkflow } from "~/t3team/t3team-types";

/** Human label for a recipe's source (Epic 16 §Recipe Sources And Precedence). */
export function recipeSourceLabel(source: T3TeamKickoffWorkflow["source"]): string {
  if (source === "project-local") return "Project recipe";
  if (source === "pack") return "Pack recipe";
  return "Bundled recipe";
}

type ThreadKickoffPlaceholderProps = {
  message: string;
  kickoffPending?: boolean;
  workflow?: T3TeamKickoffWorkflow;
};

export function shouldShowThreadKickoffPlaceholder(input: {
  kickoffMessage: string | undefined;
  serverMessageCount: number | null;
  hasServerLaunchActivity?: boolean;
}): boolean {
  if (!input.kickoffMessage?.trim()) {
    return false;
  }

  if (input.hasServerLaunchActivity) {
    return false;
  }

  return (input.serverMessageCount ?? 0) === 0;
}

export function isWaitingForKickoffInput(
  workflow: T3TeamKickoffWorkflow | undefined,
  kickoffPending: boolean | undefined,
): boolean {
  return (
    workflow?.kind === "recipe" &&
    kickoffPending !== true &&
    hasGuidedKickoffInputStep(workflow.kickoff)
  );
}

/**
 * Post-shell placeholder: the thread exists and the kickoff was sent, but no server message has
 * landed yet. For a guided recipe the launch is waiting on the user's input, so the card shows
 * that wait; the pre-shell launch panel owns everything before the shell exists.
 */
export function ThreadKickoffPlaceholder({
  message,
  kickoffPending,
  workflow,
}: ThreadKickoffPlaceholderProps) {
  const waitingForInput = isWaitingForKickoffInput(workflow, kickoffPending);
  const recipeSteps: ReadonlyArray<ThreadLaunchStepPresentation> = [
    { label: "Recipe selected", status: "done" },
    { label: "Conversation created", status: "done" },
    ...(waitingForInput
      ? [{ label: "Waiting for your recipe prompt", status: "busy" as const }]
      : []),
  ];

  return (
    <div className="border-b border-border/60 bg-muted/20 px-4 py-3 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Kickoff queued locally
        </p>
        {workflow?.kind === "recipe" ? (
          <div className="mt-2">
            <ThreadRecipeLaunchCard workflow={workflow} message={message} steps={recipeSteps} />
          </div>
        ) : (
          <div className="mt-2 max-h-[min(50dvh,28rem)] overflow-x-hidden overflow-y-auto overscroll-y-contain rounded-2xl border border-border/70 bg-card px-4 py-3 shadow-sm">
            <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">{message}</p>
          </div>
        )}
      </div>
    </div>
  );
}
