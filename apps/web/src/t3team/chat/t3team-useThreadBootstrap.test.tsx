// @vitest-environment jsdom
/**
 * Regression cover for the recipe-kickoff double dispatch (P0).
 *
 * One recipe launch used to dispatch `thread.create` twice: the launch creates the thread and
 * switches the surface in one view transition, the thread view remounts, and the fresh
 * `useThreadBootstrap` instance had a fresh per-instance dispatch ref — so it planned
 * `action: "kickoff"` a second time. The orchestration store rejected the second `thread.create`
 * ("already exists and cannot be created twice") and the launch died before
 * `launchRecipeWorkflow`.
 */
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { createMockBackend } from "~/t3team/backend/t3team-mockBackend";
import type { BackendApi } from "~/t3team/backend/t3team-types";
import { clearThreadBootstrapDispatchStates } from "~/t3team/chat/t3team-threadBootstrapDispatchRegistry";
import { useThreadBootstrap } from "~/t3team/chat/t3team-useThreadBootstrap";
import type { T3TeamKickoffWorkflow } from "~/t3team/t3team-types";

const KICKOFF_MESSAGE = "Prepare a concise status update.";

function createRecipeKickoffWorkflow(): T3TeamKickoffWorkflow {
  return {
    kind: "recipe",
    recipeId: "status-report-prefill",
    title: "Draft status update",
    description: "Prepare a concise status, blocker, and next-step update for the team.",
    source: "project-local",
    surface: "project.dashboard.myWork",
    recipePath: "/tmp/project-alpha/.t3team/recipes/status-report-prefill",
    workflowPath: "/tmp/project-alpha/.t3team/recipes/status-report-prefill/workflow.ts",
  } as T3TeamKickoffWorkflow;
}

type TrackedBackend = {
  backend: BackendApi;
  dispatchCommand: ReturnType<typeof vi.fn>;
  launchRecipeWorkflow: ReturnType<typeof vi.fn>;
  threadCreateCount: () => number;
};

/**
 * Backend stub that behaves like the real orchestration store: the second `thread.create` for a
 * thread rejects with the Effect `Cause` envelope the atom-command layer produces.
 */
function createTrackedBackend(): TrackedBackend {
  const createdThreadIds = new Set<string>();
  const dispatchCommand = vi.fn(async (command: { type: string; threadId?: unknown }) => {
    if (command.type !== "thread.create") {
      return undefined;
    }
    const threadId = String(command.threadId);
    if (createdThreadIds.has(threadId)) {
      throw {
        _id: "Cause",
        failures: [
          {
            _tag: "Fail",
            error: {
              _tag: "OrchestrationDispatchCommandError",
              message: `Orchestration command invariant failed (thread.create): Thread '${threadId}' already exists and cannot be created twice.`,
            },
          },
        ],
      };
    }
    createdThreadIds.add(threadId);
    return undefined;
  });
  const launchRecipeWorkflow = vi.fn(async () => ({ ok: true, mode: "thread" as const }));

  const backend = {
    ...createMockBackend(),
    dispatchCommand,
    launchRecipeWorkflow,
    syncThreadToolContext: vi.fn(async () => undefined),
  } as unknown as BackendApi;

  return {
    backend,
    dispatchCommand,
    launchRecipeWorkflow,
    threadCreateCount: () =>
      dispatchCommand.mock.calls.filter(([command]) => command?.type === "thread.create").length,
  };
}

function BootstrapProbe({ backend, threadId }: { backend: BackendApi; threadId: string }) {
  useThreadBootstrap({
    backend,
    environmentId: "env-1",
    threadId,
    projectTitle: "Project Alpha",
    projectWorkspaceRoot: undefined,
    canonicalProjectId: "project-alpha",
    projectExists: true,
    title: "Draft status update",
    initialUserMessage: KICKOFF_MESSAGE,
    initialModelSelection: undefined,
    initialRuntimeMode: undefined,
    initialInteractionMode: undefined,
    initialBranch: undefined,
    kickoffWorkflow: createRecipeKickoffWorkflow(),
    initialToolContext: undefined,
    onInitialUserMessageSent: undefined,
    serverThread: null,
  });
  return null;
}

let containers: HTMLDivElement[] = [];
let roots: Root[] = [];

function mountProbe(backend: BackendApi, threadId: string): Root {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  containers.push(container);
  roots.push(root);
  act(() => {
    root.render(<BootstrapProbe backend={backend} threadId={threadId} />);
  });
  return root;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  clearThreadBootstrapDispatchStates();
});

afterEach(() => {
  act(() => {
    for (const root of roots) {
      root.unmount();
    }
  });
  for (const container of containers) {
    container.remove();
  }
  roots = [];
  containers = [];
});

function BranchAwareBootstrapProbe({
  backend,
  threadId,
  initialBranch,
}: {
  backend: BackendApi;
  threadId: string;
  initialBranch: string | undefined;
}) {
  useThreadBootstrap({
    backend,
    environmentId: "env-1",
    threadId,
    projectTitle: "Project Alpha",
    projectWorkspaceRoot: "/tmp/project-alpha",
    canonicalProjectId: "project-alpha",
    projectExists: true,
    title: "Draft status update",
    initialUserMessage: KICKOFF_MESSAGE,
    initialModelSelection: undefined,
    initialRuntimeMode: undefined,
    initialInteractionMode: undefined,
    initialBranch,
    kickoffWorkflow: undefined,
    initialToolContext: undefined,
    onInitialUserMessageSent: undefined,
    serverThread: null,
  });
  return null;
}

describe("useThreadBootstrap branch backfill (F11)", () => {
  it("dispatches the kickoff immediately even while the branch query is still pending, then backfills the resolved branch via thread.meta.update", async () => {
    const threadId = "thread-branch-hold-1";
    const tracked = createTrackedBackend();

    const container = document.createElement("div");
    document.body.append(container);
    containers.push(container);
    const root = createRoot(container);
    roots.push(root);

    act(() => {
      root.render(
        <BranchAwareBootstrapProbe
          backend={tracked.backend}
          threadId={threadId}
          initialBranch={undefined}
        />,
      );
    });
    await flush();

    // The branch query being unresolved must NOT hold up the dispatch — a fresh kickoff with no
    // branch known yet still has to reach the server, carrying `branch: null` for now.
    expect(tracked.dispatchCommand).toHaveBeenCalledTimes(1);
    const [createCommand] = tracked.dispatchCommand.mock.calls[0] as [
      { type: string; bootstrap?: { createThread?: { branch?: string | null } } },
    ];
    expect(createCommand.type).toBe("thread.turn.start");
    expect(createCommand.bootstrap?.createThread?.branch).toBeNull();

    act(() => {
      root.render(
        <BranchAwareBootstrapProbe
          backend={tracked.backend}
          threadId={threadId}
          initialBranch="feature/some-branch"
        />,
      );
    });
    await flush();

    // Once the branch resolves, it's backfilled onto the already-dispatched thread rather than
    // being lost.
    expect(tracked.dispatchCommand).toHaveBeenCalledTimes(2);
    const [metaUpdateCommand] = tracked.dispatchCommand.mock.calls[1] as [
      { type: string; threadId?: unknown; branch?: string | null; expectedBranch?: string | null },
    ];
    expect(metaUpdateCommand.type).toBe("thread.meta.update");
    expect(metaUpdateCommand.threadId).toBe(threadId);
    expect(metaUpdateCommand.branch).toBe("feature/some-branch");
    expect(metaUpdateCommand.expectedBranch).toBeNull();
  });

  it("dispatches the kickoff immediately when the environment does not exist yet (fresh kickoff regression)", async () => {
    // The environment a kickoff's branch query needs is often created BY this very dispatch — a
    // fresh kickoff must not deadlock waiting for a query that can only resolve after the
    // dispatch already went out.
    const threadId = "thread-fresh-kickoff-1";
    const tracked = createTrackedBackend();

    const container = document.createElement("div");
    document.body.append(container);
    containers.push(container);
    const root = createRoot(container);
    roots.push(root);

    act(() => {
      root.render(
        <BranchAwareBootstrapProbe
          backend={tracked.backend}
          threadId={threadId}
          initialBranch={undefined}
        />,
      );
    });
    await flush();

    expect(tracked.dispatchCommand).toHaveBeenCalledTimes(1);
    expect(tracked.dispatchCommand.mock.calls[0]?.[0]?.type).toBe("thread.turn.start");
  });
});

describe("useThreadBootstrap recipe kickoff", () => {
  it("dispatches thread.create once when the launch remounts the thread view", async () => {
    const threadId = "thread-remount-1";
    const tracked = createTrackedBackend();

    const first = mountProbe(tracked.backend, threadId);
    await flush();

    // The launch swaps the surface: the first thread view unmounts and a new instance mounts for
    // the same thread id.
    act(() => {
      first.unmount();
    });
    roots = roots.filter((root) => root !== first);
    mountProbe(tracked.backend, threadId);
    await flush();

    expect(tracked.threadCreateCount()).toBe(1);
    expect(tracked.launchRecipeWorkflow).toHaveBeenCalledTimes(1);
  });

  it("dispatches thread.create once when two thread views render the same thread", async () => {
    const threadId = "thread-two-mounts-1";
    const tracked = createTrackedBackend();

    mountProbe(tracked.backend, threadId);
    mountProbe(tracked.backend, threadId);
    await flush();

    expect(tracked.threadCreateCount()).toBe(1);
    expect(tracked.launchRecipeWorkflow).toHaveBeenCalledTimes(1);
  });
});
