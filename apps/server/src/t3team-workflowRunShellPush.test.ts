import { describe, expect, it } from "vite-plus/test";
import type { OrchestrationCommand } from "@t3tools/contracts";

import {
  createWorkflowRunShellPusher,
  pushWorkflowRunThreadShell,
} from "./t3team-workflowRunShellPush.ts";

const dispatchCapture = () => {
  const dispatched: OrchestrationCommand[] = [];
  return {
    dispatched,
    dispatch: async (command: OrchestrationCommand) => {
      dispatched.push(command);
    },
  };
};

describe("pushWorkflowRunThreadShell", () => {
  it("dispatches a field-less thread.meta.update for the launch thread", () => {
    const { dispatched, dispatch } = dispatchCapture();
    pushWorkflowRunThreadShell({
      launchThreadId: "launch-1",
      dispatch,
      newId: () => "id-1",
    });

    expect(dispatched).toHaveLength(1);
    const [command] = dispatched;
    expect(command?.type).toBe("thread.meta.update");
    expect(command?.type === "thread.meta.update" && command.threadId).toBe("launch-1");
    // No other field is set — this command exists only to make the projection re-derive and
    // push, never to change anything the thread actually shows.
    expect(command?.type === "thread.meta.update" && command.title).toBeUndefined();
    expect(command?.type === "thread.meta.update" && command.activityLabel).toBeUndefined();
  });

  it("is a no-op for a headless run with no launch thread", () => {
    const { dispatched, dispatch } = dispatchCapture();
    pushWorkflowRunThreadShell({ launchThreadId: undefined, dispatch, newId: () => "id-1" });
    pushWorkflowRunThreadShell({ launchThreadId: null, dispatch, newId: () => "id-1" });
    expect(dispatched).toHaveLength(0);
  });

  it("is a no-op when the caller never wired dispatch through", () => {
    // Mirrors the recipe-workflow test harness launcher, which builds a lifecycle without
    // dispatch/newId — a missing push capability must never throw.
    expect(() =>
      pushWorkflowRunThreadShell({ launchThreadId: "launch-1", dispatch: undefined, newId: undefined }),
    ).not.toThrow();
  });

  it("swallows a rejected dispatch instead of throwing", async () => {
    pushWorkflowRunThreadShell({
      launchThreadId: "launch-1",
      dispatch: async () => {
        throw new Error("decider rejected the command");
      },
      newId: () => "id-1",
    });
    // The rejection is handled asynchronously inside the helper; give it a tick to settle so an
    // unhandled rejection would surface here rather than escape the test silently.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});

describe("createWorkflowRunShellPusher", () => {
  it("pushes once per distinct status, collapsing repeated re-affirmations of the same one", () => {
    const { dispatched, dispatch } = dispatchCapture();
    const pushIfTransitioned = createWorkflowRunShellPusher({
      launchThreadId: "launch-1",
      dispatch,
      newId: () => "id-1",
    });

    // `recordActive` calls this before EVERY primitive in a run — a chatty run must not spam a
    // push for each one while the status stays "running".
    pushIfTransitioned("running");
    pushIfTransitioned("running");
    pushIfTransitioned("running");
    expect(dispatched).toHaveLength(1);

    // A genuine transition (e.g. an askUser suspend) always pushes again.
    pushIfTransitioned("suspended");
    expect(dispatched).toHaveLength(2);

    // Resuming back to "running" is a real transition too, not a repeat of the first push.
    pushIfTransitioned("running");
    expect(dispatched).toHaveLength(3);

    // A terminal status pushes once, and settles there.
    pushIfTransitioned("completed");
    pushIfTransitioned("completed");
    expect(dispatched).toHaveLength(4);
  });
});
