/**
 * What "Retry launch" has to undo.
 *
 * A retry that recreates the thread but skips the launch is worse than the failure it is retrying:
 * a conversation appears and no run ever starts. Both claims are taken on the way to a launch, so
 * both have to be released.
 *
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vite-plus/test";

import { tryClaimRecipeWorkflowLaunch } from "~/t3team/chat/t3team-recipeLaunchDedup";
import {
  clearThreadBootstrapDispatchStates,
  readThreadBootstrapDispatchState,
  resetThreadBootstrapDispatchState,
} from "~/t3team/chat/t3team-threadBootstrapDispatchRegistry";
import { planThreadBootstrap } from "~/t3team/chat/t3team-threadBootstrapPlan";

const THREAD_ID = "thread-retry-1";

function planFor(threadId: string) {
  return planThreadBootstrap({
    currentState: readThreadBootstrapDispatchState(threadId),
    threadId,
    hasServerThread: false,
    hasInitialUserMessage: true,
    hasKickoffWorkflow: false,
    hasProjectWorkspaceRoot: true,
    projectExists: true,
  });
}

describe("retrying a stalled bootstrap", () => {
  beforeEach(() => {
    clearThreadBootstrapDispatchStates();
    resetThreadBootstrapDispatchState(THREAD_ID);
  });

  it("re-plans the kickoff after the first attempt claimed it", () => {
    const first = planFor(THREAD_ID);
    expect(first.action).toBe("kickoff");
    first.state.kickoffSent = true;
    // Without a reset the retry is a no-op, which is what "Retry launch does nothing" looked like.
    expect(planFor(THREAD_ID).action).toBe("none");

    resetThreadBootstrapDispatchState(THREAD_ID);
    expect(planFor(THREAD_ID).action).toBe("kickoff");
  });

  it("releases the launch claim so the retry can actually launch again", () => {
    expect(tryClaimRecipeWorkflowLaunch(THREAD_ID)).toBe(true);
    // The stalled attempt already holds the claim; a second attempt would skip the launch.
    expect(tryClaimRecipeWorkflowLaunch(THREAD_ID)).toBe(false);

    resetThreadBootstrapDispatchState(THREAD_ID);

    expect(tryClaimRecipeWorkflowLaunch(THREAD_ID)).toBe(true);
  });
});
