import type { T3TeamKickoffWorkflow } from "~/t3team/t3team-types";
import type { ThreadBootstrapStatus } from "~/t3team/chat/t3team-useThreadBootstrap";
import { useThreadBootstrapStall } from "~/t3team/chat/t3team-useThreadBootstrapStall";
import {
  selectThreadLaunchSteps,
  type ThreadBootstrapProgress,
} from "~/t3team/chat/t3team-threadBootstrapProgress";
import {
  ThreadKickoffFirstMessage,
  ThreadLaunchFailure,
  ThreadLaunchStepList,
} from "~/t3team/chat/t3team-threadLaunchSteps";
import { ThreadRecipeLaunchCard } from "~/t3team/chat/t3team-threadRecipeLaunchCard";

/**
 * The instant-kickoff view: what the thread shows the moment it opens, before the server shell
 * exists. The user's prompt (or the recipe's launch card) is the first thing visible, with each
 * preparation step — create the conversation, prepare the context, start the run — inline below
 * it, busy until done or error. This replaces the old full-panel "Creating thread…" spinner.
 */
export function ThreadKickoffLaunchPanel({
  threadId,
  kickoffMessage,
  workflow,
  progress,
  bootstrapStatus,
  onRetry,
}: {
  threadId: string;
  kickoffMessage: string | undefined;
  workflow: T3TeamKickoffWorkflow | undefined;
  progress: ThreadBootstrapProgress | null;
  bootstrapStatus: ThreadBootstrapStatus;
  onRetry: () => void;
}) {
  const isFailed = bootstrapStatus === "failed";
  const stalled = useThreadBootstrapStall({ pending: !isFailed, threadId });
  const failedStep = progress?.steps.find((step) => step.status === "error");
  const recipeSteps = [
    { label: "Recipe selected", status: "done" as const },
    ...selectThreadLaunchSteps(progress),
  ];

  return (
    <div className="scrollbar-gutter-both flex-1 overflow-y-auto px-4 py-4 sm:px-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        {kickoffMessage ? <ThreadKickoffFirstMessage text={kickoffMessage} /> : null}
        {workflow?.kind === "recipe" ? (
          <ThreadRecipeLaunchCard
            workflow={workflow}
            message={kickoffMessage ?? ""}
            steps={recipeSteps}
          />
        ) : (
          <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
            <ThreadLaunchStepList progress={progress} />
          </div>
        )}
        {isFailed ? (
          <ThreadLaunchFailure
            title="Launch interrupted"
            detail={
              failedStep?.error
                ? `${failedStep.error} The conversation is kept. Retry to send it again.`
                : "The kickoff didn't reach the run. Retry the launch to send it again — the conversation is kept."
            }
            retryLabel="Retry launch"
            onRetry={onRetry}
          />
        ) : null}
        {stalled && !isFailed ? (
          <ThreadLaunchFailure
            title="This didn't start"
            detail="Something went wrong before anything was sent — no model was called and nothing ran. Retrying is safe."
            retryLabel="Retry"
            onRetry={onRetry}
          />
        ) : null}
      </div>
    </div>
  );
}
