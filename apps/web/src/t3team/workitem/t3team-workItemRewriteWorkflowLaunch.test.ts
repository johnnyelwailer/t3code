/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vite-plus/test";

import type { BackendApi } from "~/t3team/backend/t3team-types";
import { runThreadBootstrapKickoff } from "~/t3team/chat/t3team-runThreadBootstrapKickoff";
import {
  buildWorkItemRewriteKickoffMessage,
  buildWorkItemRewriteParameters,
  buildWorkItemRewriteWorkflow,
  launchWorkItemRewriteOnThread,
} from "./t3team-workItemRewriteWorkflowLaunch";

const WORKSPACE_ROOT = "/tmp/project-alpha";

const LAUNCH_CONFIG = {
  selection: { instanceId: "instance-1", model: "test-model" },
  runtimeMode: "chat",
  interactionMode: "default",
  selectedToolIds: [],
} as unknown as Parameters<typeof launchWorkItemRewriteOnThread>[0]["launchConfig"];

function baseWorkflow() {
  const workflow = buildWorkItemRewriteWorkflow({
    issueIdOrKey: "PROJ-42",
    summary: "Camera resets on reload",
    currentBody: "Current text.",
    projectWorkspaceRoot: WORKSPACE_ROOT,
  });
  if (!workflow) throw new Error("expected a workflow");
  return workflow;
}

describe("buildWorkItemRewriteParameters", () => {
  it("keeps the issue key and drops blank optionals", () => {
    expect(
      buildWorkItemRewriteParameters({
        issueIdOrKey: "PROJ-42",
        summary: "   ",
        currentBody: undefined,
      }),
    ).toEqual({ issueIdOrKey: "PROJ-42" });
  });

  it("trims the optionals it does keep", () => {
    expect(
      buildWorkItemRewriteParameters({
        issueIdOrKey: "PROJ-42",
        summary: " Title ",
        currentBody: " Body ",
      }),
    ).toEqual({ issueIdOrKey: "PROJ-42", summary: "Title", currentBody: "Body" });
  });
});

describe("buildWorkItemRewriteWorkflow", () => {
  it("carries recipePath and workflowPath, without which the run gets no draft tools", () => {
    const workflow = baseWorkflow();
    expect(workflow.recipeId).toBe("describe-rewrite");
    expect(workflow.recipePath).toBe(`${WORKSPACE_ROOT}/.t3team/recipes/describe-rewrite`);
    expect(workflow.workflowPath).toBe(
      `${WORKSPACE_ROOT}/.t3team/recipes/describe-rewrite/workflow.ts`,
    );
    expect(workflow.parameters).toEqual({
      issueIdOrKey: "PROJ-42",
      summary: "Camera resets on reload",
      currentBody: "Current text.",
    });
  });

  it("returns null without a workspace root rather than launching a toolless run", () => {
    expect(buildWorkItemRewriteWorkflow({ issueIdOrKey: "PROJ-42" })).toBeNull();
  });
});

describe("buildWorkItemRewriteKickoffMessage", () => {
  it("is a non-empty human sentence, not an instruction to call the draft tool", () => {
    const message = buildWorkItemRewriteKickoffMessage("PROJ-42");
    expect(message).toContain("PROJ-42");
    expect(message.trim().length).toBeGreaterThan(0);
    expect(message).not.toContain("draft_update");
  });
});

describe("launchWorkItemRewriteOnThread", () => {
  it("launches on the existing thread with modelSelection and the recipe paths", async () => {
    const launchRecipeWorkflow = vi.fn().mockResolvedValue({ ok: true });
    await launchWorkItemRewriteOnThread({
      backend: { launchRecipeWorkflow } as unknown as BackendApi,
      threadId: "thread-1",
      workflow: baseWorkflow(),
      launchConfig: LAUNCH_CONFIG,
      kickoffMessage: buildWorkItemRewriteKickoffMessage("PROJ-42"),
    });

    expect(launchRecipeWorkflow).toHaveBeenCalledTimes(1);
    const request = launchRecipeWorkflow.mock.calls[0]?.[0] as unknown as {
      threadId: string;
      modelSelection: { instanceId: string; model: string };
      launch: { recipePath: string; workflowPath: string; parameters: Record<string, unknown> };
    };
    expect(request.threadId).toBe("thread-1");
    expect(request.modelSelection).toEqual({ instanceId: "instance-1", model: "test-model" });
    expect(request.launch.recipePath).toBe(`${WORKSPACE_ROOT}/.t3team/recipes/describe-rewrite`);
    expect(request.launch.workflowPath).toBe(
      `${WORKSPACE_ROOT}/.t3team/recipes/describe-rewrite/workflow.ts`,
    );
    expect(request.launch.parameters).toMatchObject({ issueIdOrKey: "PROJ-42" });
  });
});

/**
 * The second half of the no-thread two-step. The hook hands this workflow to `onKickoffThread`;
 * whatever survives the navigation runs the thread bootstrap, and THAT is what must launch the
 * workflow instead of starting a turn. Exercised against the real bootstrap kickoff so the handoff
 * is proven end to end rather than assumed from the shape of the object.
 */
describe("kickoff handoff", () => {
  it("launches the recipe and never starts a model turn", async () => {
    const dispatchCommand = vi.fn().mockResolvedValue(undefined);
    const launchRecipeWorkflow = vi.fn().mockResolvedValue({ ok: true });
    const backend = {
      dispatchCommand,
      launchRecipeWorkflow,
      syncThreadToolContext: vi.fn().mockResolvedValue(undefined),
    } as unknown as BackendApi;

    await runThreadBootstrapKickoff({
      backend,
      action: "kickoff",
      state: {
        threadId: "thread-handoff",
        projectEnsured: true,
        threadCreateSent: false,
        kickoffSent: false,
      },
      environmentId: "env-1",
      threadId: "thread-handoff",
      canonicalProjectId: "project-1",
      title: "PROJ-42 kickoff 1",
      initialUserMessage: buildWorkItemRewriteKickoffMessage("PROJ-42"),
      kickoffModelSelection: LAUNCH_CONFIG.selection,
      kickoffRuntimeMode: LAUNCH_CONFIG.runtimeMode,
      kickoffInteractionMode: LAUNCH_CONFIG.interactionMode,
      kickoffBranch: null,
      kickoffWorkflow: baseWorkflow(),
      toolContext: undefined,
      createdAt: new Date().toISOString(),
      onInitialUserMessageSent: undefined,
    });

    expect(launchRecipeWorkflow).toHaveBeenCalledTimes(1);
    const launched = launchRecipeWorkflow.mock.calls[0]?.[0] as unknown as {
      launch: { recipePath: string; parameters: Record<string, unknown> };
    };
    expect(launched.launch.recipePath).toBe(`${WORKSPACE_ROOT}/.t3team/recipes/describe-rewrite`);
    expect(launched.launch.parameters).toMatchObject({ issueIdOrKey: "PROJ-42" });

    const dispatchedTypes = dispatchCommand.mock.calls.map(
      (call) => (call[0] as unknown as { type: string }).type,
    );
    expect(dispatchedTypes).toContain("thread.create");
    expect(dispatchedTypes).not.toContain("thread.turn.start");
  });
});
