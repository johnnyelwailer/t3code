/**
 * "Retry launch" after the server shell exists.
 *
 * The workflow path creates the shell before it launches, so a launch that throws leaves a shell
 * behind. A retry used to plan `none` on that shell: the error banner vanished and nothing ran.
 *
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { BackendApi } from "~/t3team/backend/t3team-types";
import { createRecordingOrchestrationApi } from "~/t3team/backend/t3team-orchestrationApi.testSupport";
import { releaseRecipeWorkflowLaunchClaim } from "~/t3team/chat/t3team-recipeLaunchDedup";
import {
  runThreadBootstrapEffect,
  type RunThreadBootstrapEffectInput,
  type ThreadBootstrapStatus,
} from "~/t3team/chat/t3team-runThreadBootstrapEffect";
import {
  clearThreadBootstrapDispatchStates,
  resetThreadBootstrapDispatchState,
} from "~/t3team/chat/t3team-threadBootstrapDispatchRegistry";
import type { T3TeamKickoffWorkflow } from "~/t3team/t3team-types";

const THREAD_ID = "thread-relaunch-1";

const WORKFLOW: T3TeamKickoffWorkflow = {
  kind: "recipe",
  recipeId: "qa-test-plan",
  recipeVersion: "0.1.0",
  title: "Create QA plan",
  description: "Build a focused QA plan.",
  source: "project-local",
  surface: "workitem.detail.sidepanel",
  reason: "QA planning applies to bugs",
  recipePath: "/tmp/project-alpha/.t3team/recipes/qa-test-plan",
  promptPath: "/tmp/project-alpha/.t3team/recipes/qa-test-plan/prompt.md",
  workflowPath: "/tmp/project-alpha/.t3team/recipes/qa-test-plan/workflow.ts",
  allowedToolGroups: [],
};

function createBackend() {
  return {
    orchestration: createRecordingOrchestrationApi(),
    launchRecipeWorkflow: vi.fn(async () => ({ ok: true })),
    syncThreadToolContext: vi.fn(async () => undefined),
  } as unknown as BackendApi;
}

/** Runs one effect pass and resolves with the status it settles on (`failed` or `idle`). */
function runPass(
  input: Omit<RunThreadBootstrapEffectInput, "updateBootstrapStatus">,
  statuses: ThreadBootstrapStatus[],
): Promise<ThreadBootstrapStatus> {
  return new Promise((resolve) => {
    let dispatched = false;
    runThreadBootstrapEffect({
      ...input,
      updateBootstrapStatus: (status) => {
        statuses.push(status);
        if (status === "running") dispatched = true;
        else if (dispatched || status === "failed") resolve(status);
        else queueMicrotask(() => resolve(status));
      },
    });
  });
}

function baseInput(
  backend: BackendApi,
  overrides: Partial<RunThreadBootstrapEffectInput> = {},
): Omit<RunThreadBootstrapEffectInput, "updateBootstrapStatus"> {
  return {
    backend,
    environmentId: "env-1",
    threadId: THREAD_ID,
    projectTitle: "Project Alpha",
    projectWorkspaceRoot: "/tmp/project-alpha",
    canonicalProjectId: "project-alpha",
    projectExists: true,
    title: "Thread title",
    initialUserMessage: "Plan the QA pass",
    initialModelSelection: { instanceId: "codex" as never, model: "gpt-5.4" },
    initialRuntimeMode: "full-access",
    initialInteractionMode: "default",
    initialBranch: undefined,
    kickoffWorkflow: WORKFLOW,
    initialToolContext: undefined,
    onInitialUserMessageSent: undefined,
    serverThread: null,
    ...overrides,
  };
}

describe("retrying a launch that failed after the server shell exists", () => {
  beforeEach(() => {
    clearThreadBootstrapDispatchStates();
    releaseRecipeWorkflowLaunchClaim(THREAD_ID);
  });

  it("re-launches the workflow into the existing shell without creating it again", async () => {
    const backend = createBackend();
    vi.mocked(backend.launchRecipeWorkflow!).mockRejectedValueOnce(new Error("launch failed"));
    const statuses: ThreadBootstrapStatus[] = [];

    expect(await runPass(baseInput(backend), statuses)).toBe("failed");
    expect(backend.orchestration.createThread).toHaveBeenCalledTimes(1);
    expect(backend.launchRecipeWorkflow).toHaveBeenCalledTimes(1);

    const withShell = baseInput(backend, { serverThread: { branch: null } });
    // The shell arriving must keep the failure on screen and not re-dispatch by itself.
    expect(await runPass(withShell, statuses)).toBe("failed");
    expect(backend.launchRecipeWorkflow).toHaveBeenCalledTimes(1);

    resetThreadBootstrapDispatchState(THREAD_ID);
    expect(await runPass(withShell, statuses)).toBe("idle");

    expect(backend.launchRecipeWorkflow).toHaveBeenCalledTimes(2);
    expect(backend.launchRecipeWorkflow).toHaveBeenLastCalledWith(
      expect.objectContaining({ threadId: THREAD_ID, kickoffMessage: "Plan the QA pass" }),
    );
    expect(backend.orchestration.createThread).toHaveBeenCalledTimes(1);

    // Once the retry succeeded, later passes do not launch a third time.
    expect(await runPass(withShell, statuses)).toBe("idle");
    expect(backend.launchRecipeWorkflow).toHaveBeenCalledTimes(2);
  });

  it("sends a plain kickoff turn into the existing shell without a create bootstrap", async () => {
    const backend = createBackend();
    vi.mocked(backend.orchestration.startThreadTurn).mockRejectedValueOnce(
      new Error("turn failed"),
    );
    const statuses: ThreadBootstrapStatus[] = [];
    const turnInput = baseInput(backend, { kickoffWorkflow: undefined });

    expect(await runPass(turnInput, statuses)).toBe("failed");
    expect(
      vi.mocked(backend.orchestration.startThreadTurn).mock.calls[0]?.[0].bootstrap,
    ).toBeDefined();

    resetThreadBootstrapDispatchState(THREAD_ID);
    const retry = { ...turnInput, serverThread: { branch: null } };
    expect(await runPass(retry, statuses)).toBe("idle");

    const calls = vi.mocked(backend.orchestration.startThreadTurn).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[1]?.[0].bootstrap).toBeUndefined();
  });

  it("does not re-send into a shell when the retry did not follow a failed kickoff", async () => {
    const backend = createBackend();
    const statuses: ThreadBootstrapStatus[] = [];

    resetThreadBootstrapDispatchState(THREAD_ID);
    const status = await runPass(baseInput(backend, { serverThread: { branch: null } }), statuses);

    expect(status).toBe("idle");
    expect(backend.launchRecipeWorkflow).not.toHaveBeenCalled();
  });
});
