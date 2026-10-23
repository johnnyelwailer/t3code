import { releaseRecipeWorkflowLaunchClaim } from "~/t3team/chat/t3team-recipeLaunchDedup";
import {
  runThreadBootstrap,
  type RunThreadBootstrapInput,
} from "~/t3team/chat/t3team-runThreadBootstrap";
import { recordThreadBootstrapFailure } from "~/t3team/chat/t3team-threadBootstrapInstrumentation";

/**
 * Claims the dispatch on the shared per-thread state and runs one bootstrap attempt, keeping
 * `kickoffSettled` / `kickoffFailed` in step with how it ends. Used by the mounted chat's effect and
 * by a kickoff that sends at click time, so both settle the same state the next plan reads.
 *
 * The claim happens synchronously, before the first `await` inside `runThreadBootstrap` can yield:
 * a second effect pass in the same tick would otherwise still read the un-flagged state.
 */
export function startThreadBootstrapRun(
  input: RunThreadBootstrapInput,
  onSettled: (outcome: "idle" | "failed") => void,
): void {
  const { state, action, threadId } = input;
  state.dispatchedBranch = input.kickoffBranch;
  if (action === "kickoff") {
    state.kickoffSent = true;
    state.kickoffSettled = false;
    state.kickoffFailed = false;
  } else {
    state.threadCreateSent = true;
  }

  void runThreadBootstrap(input)
    .then(() => {
      if (action === "kickoff") {
        state.kickoffSettled = true;
      }
      onSettled("idle");
    })
    .catch((error) => {
      onSettled("failed");
      recordThreadBootstrapFailure({
        environmentId: input.environmentId,
        threadId,
        canonicalProjectId: input.canonicalProjectId,
        action,
        error: error instanceof Error ? error.message : String(error),
      });

      if (action === "kickoff") {
        state.kickoffSettled = true;
        state.kickoffFailed = true;
        releaseRecipeWorkflowLaunchClaim(threadId);
      } else if (action === "create") {
        state.threadCreateSent = false;
      }
    });
}
