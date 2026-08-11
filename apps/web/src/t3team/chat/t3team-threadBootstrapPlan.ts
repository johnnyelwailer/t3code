export type ThreadBootstrapDispatchState = {
  threadId: string | null;
  projectEnsured: boolean;
  threadCreateSent: boolean;
  kickoffSent: boolean;
  // The branch the create/kickoff dispatch actually carried (`null` when it went out before the
  // workspace's branch was known). Once set, `runThreadBootstrapEffect` uses this to decide
  // whether a later-resolved branch still needs to be backfilled via `thread.meta.update`.
  dispatchedBranch: string | null | undefined;
  branchBackfillSent: boolean;
};

export type ThreadBootstrapAction = "none" | "create" | "kickoff";

export function resolveThreadBootstrapDispatchState(
  currentState: ThreadBootstrapDispatchState | undefined,
  threadId: string,
): ThreadBootstrapDispatchState {
  if (currentState?.threadId === threadId) {
    return currentState;
  }

  return {
    threadId,
    projectEnsured: false,
    threadCreateSent: false,
    kickoffSent: false,
    dispatchedBranch: undefined,
    branchBackfillSent: false,
  };
}

export function planThreadBootstrap(input: {
  currentState: ThreadBootstrapDispatchState | undefined;
  threadId: string;
  hasServerThread: boolean;
  hasInitialUserMessage: boolean;
  /**
   * A workflow-only recipe (defineWorkflow, no definePrompt) legitimately kicks off with an EMPTY
   * message — gating the kickoff on the message alone silently downgrades such a launch to a bare
   * `thread.create` (thread exists, no run, no error). The workflow itself is what makes it a
   * kickoff.
   */
  hasKickoffWorkflow: boolean;
  hasProjectWorkspaceRoot: boolean;
  projectExists: boolean;
}): {
  state: ThreadBootstrapDispatchState;
  action: ThreadBootstrapAction;
  shouldEnsureProject: boolean;
} {
  const state = resolveThreadBootstrapDispatchState(input.currentState, input.threadId);

  if (input.hasServerThread) {
    return {
      state,
      action: "none",
      shouldEnsureProject: false,
    };
  }

  if (input.hasInitialUserMessage || input.hasKickoffWorkflow) {
    return {
      state,
      action: state.kickoffSent ? "none" : "kickoff",
      shouldEnsureProject:
        !state.kickoffSent &&
        input.hasProjectWorkspaceRoot &&
        !input.projectExists &&
        !state.projectEnsured,
    };
  }

  return {
    state,
    action: state.threadCreateSent ? "none" : "create",
    shouldEnsureProject:
      !state.threadCreateSent &&
      input.hasProjectWorkspaceRoot &&
      !input.projectExists &&
      !state.projectEnsured,
  };
}
