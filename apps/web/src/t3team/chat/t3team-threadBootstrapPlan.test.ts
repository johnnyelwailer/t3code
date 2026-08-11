import { describe, expect, it } from "vite-plus/test";

import {
  planThreadBootstrap,
  resolveThreadBootstrapDispatchState,
} from "~/t3team/chat/t3team-threadBootstrapPlan";

describe("planThreadBootstrap", () => {
  it("resets sent flags when the thread changes", () => {
    const currentState = {
      threadId: "thread-a",
      projectEnsured: true,
      threadCreateSent: true,
      kickoffSent: true,
      dispatchedBranch: undefined,
      branchBackfillSent: false,
    };

    const result = planThreadBootstrap({
      currentState,
      threadId: "thread-b",
      hasServerThread: false,
      hasInitialUserMessage: false,
      hasKickoffWorkflow: false,
      hasProjectWorkspaceRoot: true,
      projectExists: false,
    });

    expect(result.state).toEqual({
      threadId: "thread-b",
      projectEnsured: false,
      threadCreateSent: false,
      kickoffSent: false,
      dispatchedBranch: undefined,
      branchBackfillSent: false,
    });
    expect(result.action).toBe("create");
    expect(result.shouldEnsureProject).toBe(true);
  });

  it("skips bootstrap work once the live thread exists", () => {
    const result = planThreadBootstrap({
      currentState: resolveThreadBootstrapDispatchState(undefined, "thread-a"),
      threadId: "thread-a",
      hasServerThread: true,
      hasInitialUserMessage: true,
      hasKickoffWorkflow: false,
      hasProjectWorkspaceRoot: true,
      projectExists: false,
    });

    expect(result.action).toBe("none");
    expect(result.shouldEnsureProject).toBe(false);
  });

  it("does not retry kickoff bootstrap on rerender after it was sent", () => {
    const result = planThreadBootstrap({
      currentState: {
        threadId: "thread-a",
        projectEnsured: true,
        threadCreateSent: false,
        kickoffSent: true,
        dispatchedBranch: undefined,
        branchBackfillSent: false,
      },
      threadId: "thread-a",
      hasServerThread: false,
      hasInitialUserMessage: true,
      hasKickoffWorkflow: false,
      hasProjectWorkspaceRoot: true,
      projectExists: false,
    });

    expect(result.action).toBe("none");
    expect(result.shouldEnsureProject).toBe(false);
  });

  it("skips project creation when the canonical live project already exists", () => {
    const result = planThreadBootstrap({
      currentState: resolveThreadBootstrapDispatchState(undefined, "thread-a"),
      threadId: "thread-a",
      hasServerThread: false,
      hasInitialUserMessage: false,
      hasKickoffWorkflow: false,
      hasProjectWorkspaceRoot: true,
      projectExists: true,
    });

    expect(result.action).toBe("create");
    expect(result.shouldEnsureProject).toBe(false);
  });

  it("plans a kickoff for a workflow-only recipe with no initial message", () => {
    const result = planThreadBootstrap({
      currentState: resolveThreadBootstrapDispatchState(undefined, "thread-a"),
      threadId: "thread-a",
      hasServerThread: false,
      hasInitialUserMessage: false,
      hasKickoffWorkflow: true,
      hasProjectWorkspaceRoot: true,
      projectExists: false,
    });

    expect(result.action).toBe("kickoff");
  });

  it("does not retry a workflow-only kickoff once it was already sent", () => {
    const result = planThreadBootstrap({
      currentState: {
        threadId: "thread-a",
        projectEnsured: true,
        threadCreateSent: false,
        kickoffSent: true,
        dispatchedBranch: undefined,
        branchBackfillSent: false,
      },
      threadId: "thread-a",
      hasServerThread: false,
      hasInitialUserMessage: false,
      hasKickoffWorkflow: true,
      hasProjectWorkspaceRoot: true,
      projectExists: false,
    });

    expect(result.action).toBe("none");
  });

  it("still plans a bare create with no message and no kickoff workflow", () => {
    const result = planThreadBootstrap({
      currentState: resolveThreadBootstrapDispatchState(undefined, "thread-a"),
      threadId: "thread-a",
      hasServerThread: false,
      hasInitialUserMessage: false,
      hasKickoffWorkflow: false,
      hasProjectWorkspaceRoot: true,
      projectExists: false,
    });

    expect(result.action).toBe("create");
  });
});
