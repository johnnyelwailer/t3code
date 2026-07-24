export type ThreadBootstrapDispatchState = {
  threadId: string | null;
  projectEnsured: boolean;
  threadCreateSent: boolean;
  kickoffSent: boolean;
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
  };
}

export function planThreadBootstrap(input: {
  currentState: ThreadBootstrapDispatchState | undefined;
  threadId: string;
  hasServerThread: boolean;
  hasInitialUserMessage: boolean;
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

  if (input.hasInitialUserMessage) {
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
