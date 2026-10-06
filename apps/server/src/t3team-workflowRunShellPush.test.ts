// @effect-diagnostics globalTimers:off -- host timer for push-settle delay in the test.
import { describe, expect, it } from "vite-plus/test";

import {
  createWorkflowRunShellPusher,
  pushWorkflowRunThreadShell,
} from "./t3team-workflowRunShellPush.ts";

const hostCapture = () => {
  const synced: string[] = [];
  return {
    synced,
    host: {
      syncRunFacts: async (launchThreadId: string) => {
        synced.push(launchThreadId);
      },
    },
  };
};

describe("pushWorkflowRunThreadShell", () => {
  it("refreshes the launch thread's run facts", () => {
    const { synced, host } = hostCapture();
    pushWorkflowRunThreadShell({ launchThreadId: "launch-1", host });
    expect(synced).toEqual(["launch-1"]);
  });

  it("is a no-op for a headless run with no launch thread", () => {
    const { synced, host } = hostCapture();
    pushWorkflowRunThreadShell({ launchThreadId: undefined, host });
    pushWorkflowRunThreadShell({ launchThreadId: null, host });
    expect(synced).toHaveLength(0);
  });

  it("is a no-op when the caller runs without a host", () => {
    expect(() =>
      pushWorkflowRunThreadShell({ launchThreadId: "launch-1", host: undefined }),
    ).not.toThrow();
  });

  it("swallows a rejected sync instead of throwing", async () => {
    pushWorkflowRunThreadShell({
      launchThreadId: "launch-1",
      host: {
        syncRunFacts: async () => {
          throw new Error("facts store unavailable");
        },
      },
    });
    // The rejection is handled asynchronously inside the helper; give it a tick to settle so an
    // unhandled rejection would surface here rather than escape the test silently.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});

describe("createWorkflowRunShellPusher", () => {
  it("pushes once per distinct status, collapsing repeated re-affirmations of the same one", () => {
    const { synced, host } = hostCapture();
    const pushIfTransitioned = createWorkflowRunShellPusher({ launchThreadId: "launch-1", host });

    // `recordActive` calls this before EVERY primitive in a run — a chatty run must not spam a
    // push for each one while the status stays "running".
    pushIfTransitioned("running");
    pushIfTransitioned("running");
    pushIfTransitioned("running");
    expect(synced).toHaveLength(1);

    // A genuine transition (e.g. an askUser suspend) always pushes again.
    pushIfTransitioned("suspended");
    expect(synced).toHaveLength(2);

    // Resuming back to "running" is a real transition too, not a repeat of the first push.
    pushIfTransitioned("running");
    expect(synced).toHaveLength(3);

    // A terminal status pushes once, and settles there.
    pushIfTransitioned("completed");
    pushIfTransitioned("completed");
    expect(synced).toHaveLength(4);
  });
});
