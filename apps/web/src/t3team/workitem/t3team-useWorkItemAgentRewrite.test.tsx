/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { BackendApi } from "~/t3team/backend/t3team-types";
import type { TicketKickoffThreadInput } from "~/t3team/t3team-kickoffTypes";
import {
  useWorkItemAgentRewrite,
  type UseWorkItemAgentRewriteInput,
} from "./t3team-useWorkItemAgentRewrite";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const WORKSPACE_ROOT = "/tmp/project-alpha";
const RECIPE_PATH = `${WORKSPACE_ROOT}/.t3team/recipes/describe-rewrite`;

type Result = ReturnType<typeof useWorkItemAgentRewrite>;

function mount(initialProps: UseWorkItemAgentRewriteInput): {
  readonly latest: { result: Result | null };
  readonly rerender: (nextProps: UseWorkItemAgentRewriteInput) => Promise<void>;
  readonly unmount: () => Promise<void>;
} {
  const latest: { result: Result | null } = { result: null };
  const host = document.createElement("div");
  document.body.append(host);
  const root: Root = createRoot(host);

  function Harness(props: UseWorkItemAgentRewriteInput) {
    latest.result = useWorkItemAgentRewrite(props);
    return null;
  }

  const rerender = async (nextProps: UseWorkItemAgentRewriteInput) => {
    await act(async () => {
      root.render(<Harness {...nextProps} />);
    });
  };

  return {
    latest,
    rerender,
    unmount: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

/** Flushes both the microtask queue (promise chains) and a macrotask tick, for fire-and-forget
 * async work started from an event handler rather than awaited directly. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function baseProps(overrides?: Partial<UseWorkItemAgentRewriteInput>): UseWorkItemAgentRewriteInput {
  return {
    backend: {} as BackendApi,
    projectId: "proj-1",
    ticketId: "ticket-1",
    issueIdOrKey: "PROJ-42",
    ticketDisplayId: "PROJ-42",
    projectWorkspaceRoot: WORKSPACE_ROOT,
    descriptionText: "Current text.",
    githubActivityItems: [],
    hasPendingDescriptionDraft: false,
    hasLoadedWorkItem: true,
    onKickoffThread: () => {},
    ...overrides,
  };
}

function backendWith(launchRecipeWorkflow: ReturnType<typeof vi.fn>, dispatchCommand = vi.fn()) {
  return {
    backend: { launchRecipeWorkflow, dispatchCommand } as unknown as BackendApi,
    dispatchCommand,
  };
}

describe("useWorkItemAgentRewrite", () => {
  let harness: ReturnType<typeof mount> | null = null;

  afterEach(async () => {
    await harness?.unmount();
    harness = null;
  });

  it("launches the describe-rewrite workflow on the active thread instead of a model turn", async () => {
    const launchRecipeWorkflow = vi.fn().mockResolvedValue({ ok: true });
    const { backend, dispatchCommand } = backendWith(launchRecipeWorkflow);
    harness = mount(baseProps({ backend, activeThreadId: "thread-1" }));
    await harness.rerender(baseProps({ backend, activeThreadId: "thread-1" }));

    await act(async () => {
      harness!.latest.result?.start();
      await flush();
    });

    // The invariant: clicking spends nothing. No turn is dispatched — the workflow's deterministic
    // askUser card runs first, and only the human's answer reaches a model.
    expect(dispatchCommand).not.toHaveBeenCalled();
    expect(launchRecipeWorkflow).toHaveBeenCalledTimes(1);
    const request = launchRecipeWorkflow.mock.calls[0]?.[0] as {
      threadId: string;
      modelSelection: { instanceId: string; model: string };
      launch: {
        recipeId: string;
        recipePath: string;
        workflowPath: string;
        parameters: Record<string, unknown>;
      };
    };
    expect(request.threadId).toBe("thread-1");
    expect(request.modelSelection.instanceId.length).toBeGreaterThan(0);
    expect(request.launch.recipeId).toBe("describe-rewrite");
    expect(request.launch.recipePath).toBe(RECIPE_PATH);
    expect(request.launch.workflowPath).toBe(`${RECIPE_PATH}/workflow.ts`);
    expect(request.launch.parameters).toMatchObject({
      issueIdOrKey: "PROJ-42",
      currentBody: "Current text.",
    });
    expect(harness!.latest.result?.isStarting).toBe(false);
  });

  it("hands the workflow to the kickoff when there is no thread yet, and starts no turn itself", async () => {
    const onKickoffThread = vi.fn<(input: TicketKickoffThreadInput) => void>();
    const launchRecipeWorkflow = vi.fn().mockResolvedValue({ ok: true });
    const { backend, dispatchCommand } = backendWith(launchRecipeWorkflow);
    harness = mount(baseProps({ backend, onKickoffThread }));
    await harness.rerender(baseProps({ backend, onKickoffThread }));

    await act(async () => {
      harness!.latest.result?.start();
      await flush();
    });

    expect(onKickoffThread).toHaveBeenCalledTimes(1);
    const input = onKickoffThread.mock.calls[0]?.[0];
    expect(input?.projectId).toBe("proj-1");
    expect(input?.ticketId).toBe("ticket-1");
    expect(input?.ticketDisplayId).toBe("PROJ-42");
    // Step two runs after the navigation, inside the thread bootstrap: this step only creates the
    // thread and carries the workflow, so nothing is launched (or spent) here.
    expect(launchRecipeWorkflow).not.toHaveBeenCalled();
    expect(dispatchCommand).not.toHaveBeenCalled();
    // A workflowPath is what makes the bootstrap launch the recipe rather than start a turn.
    expect(input?.kickoffWorkflow?.workflowPath).toBe(`${RECIPE_PATH}/workflow.ts`);
    expect(input?.kickoffWorkflow?.recipePath).toBe(RECIPE_PATH);
    expect(input?.kickoffWorkflow?.parameters).toMatchObject({ issueIdOrKey: "PROJ-42" });
    // The bootstrap only plans a kickoff when there is an initial message, and it must not be the
    // old rewrite prompt (which told the agent to call the draft tool itself).
    expect(input?.kickoffPending).toBe(true);
    expect(input?.kickoffMessage.trim().length).toBeGreaterThan(0);
    expect(input?.kickoffMessage).not.toContain("draft_update");
  });

  it("does not fire a second kickoff when start() is called again right after a kickoff launch", async () => {
    const onKickoffThread = vi.fn<(input: TicketKickoffThreadInput) => void>();
    harness = mount(baseProps({ onKickoffThread }));
    await harness.rerender(baseProps({ onKickoffThread }));

    act(() => {
      harness!.latest.result?.start();
    });
    expect(onKickoffThread).toHaveBeenCalledTimes(1);
    expect(harness!.latest.result?.isDisabled).toBe(true);

    // A second click before navigation has unmounted the control — the latch must hold.
    act(() => {
      harness!.latest.result?.start();
    });
    expect(onKickoffThread).toHaveBeenCalledTimes(1);
  });

  it("does not start when the work item has not loaded", async () => {
    const onKickoffThread = vi.fn<(input: TicketKickoffThreadInput) => void>();
    harness = mount(baseProps({ onKickoffThread, hasLoadedWorkItem: false }));
    await harness.rerender(baseProps({ onKickoffThread, hasLoadedWorkItem: false }));

    expect(harness!.latest.result?.isDisabled).toBe(true);

    act(() => {
      harness!.latest.result?.start();
    });
    expect(onKickoffThread).not.toHaveBeenCalled();
  });

  it("is disabled while a description draft is already pending", async () => {
    const onKickoffThread = vi.fn<(input: TicketKickoffThreadInput) => void>();
    harness = mount(baseProps({ onKickoffThread, hasPendingDescriptionDraft: true }));
    await harness.rerender(baseProps({ onKickoffThread, hasPendingDescriptionDraft: true }));

    expect(harness!.latest.result?.isDisabled).toBe(true);
    act(() => {
      harness!.latest.result?.start();
    });
    expect(onKickoffThread).not.toHaveBeenCalled();
  });

  it("surfaces a missing workspace instead of launching a run with no draft tools", async () => {
    const onKickoffThread = vi.fn<(input: TicketKickoffThreadInput) => void>();
    const props = baseProps({ onKickoffThread });
    const { projectWorkspaceRoot: _omitted, ...withoutWorkspace } = props;
    harness = mount(withoutWorkspace);
    await harness.rerender(withoutWorkspace);

    act(() => {
      harness!.latest.result?.start();
    });

    expect(onKickoffThread).not.toHaveBeenCalled();
    expect(harness!.latest.result?.error).not.toBeNull();
  });

  it("surfaces an error and clears isStarting when the launch rejects", async () => {
    const launchRecipeWorkflow = vi
      .fn()
      .mockRejectedValue(new Error("Thread already has a turn in progress."));
    const { backend } = backendWith(launchRecipeWorkflow);
    harness = mount(baseProps({ backend, activeThreadId: "thread-1" }));
    await harness.rerender(baseProps({ backend, activeThreadId: "thread-1" }));

    await act(async () => {
      harness!.latest.result?.start();
      await flush();
    });

    expect(harness!.latest.result?.isStarting).toBe(false);
    expect(harness!.latest.result?.error).not.toBeNull();
    expect(harness!.latest.result?.error?.headline).toContain("finishing a turn");
  });
});
