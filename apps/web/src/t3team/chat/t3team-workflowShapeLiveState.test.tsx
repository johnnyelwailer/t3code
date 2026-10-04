// @vitest-environment jsdom
/**
 * Retry reconciliation (GHE #344): after a Retry click the card shows an optimistic "running"
 * while the server row still reports the pre-click "failed" — the optimistic value must survive
 * until the server's `updatedAt` advances (the re-drive settled, for whatever status).
 */

import type { OrchestrationWorkflowRunStatus } from "@t3tools/contracts";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { RUN_ID, TEST_WORKFLOW_SHAPE } from "~/t3team/chat/t3team-messageShapeCardLive.testSupport";
import { useT3TeamWorkflowShapeLiveState } from "~/t3team/chat/t3team-workflowShapeLiveState";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mountedRoots: Array<{ root: ReturnType<typeof createRoot>; container: HTMLElement }> = [];

async function renderNode(node: ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push({ root, container });
  await act(async () => {
    root.render(node);
  });
  return container;
}

afterEach(async () => {
  while (mountedRoots.length > 0) {
    const mounted = mountedRoots.pop();
    if (!mounted) continue;
    await act(async () => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }
  document.body.innerHTML = "";
});

const FAILED_STATUS: OrchestrationWorkflowRunStatus = {
  runId: RUN_ID,
  status: "failed",
  pendingKind: null,
  wakeAt: null,
  updatedAt: "2026-07-17T10:00:00.000Z",
};

let latest: ReturnType<typeof useT3TeamWorkflowShapeLiveState> | undefined;

function Harness(props: {
  workflowRunStatus?: OrchestrationWorkflowRunStatus;
  onControlWorkflow: NonNullable<
    Parameters<typeof useT3TeamWorkflowShapeLiveState>[0]["onControlWorkflow"]
  >;
}) {
  latest = useT3TeamWorkflowShapeLiveState({
    shape: TEST_WORKFLOW_SHAPE,
    progress: { runId: RUN_ID, steps: [], run: null },
    ...(props.workflowRunStatus ? { workflowRunStatus: props.workflowRunStatus } : {}),
    onControlWorkflow: props.onControlWorkflow,
  });
  return null;
}

describe("useT3TeamWorkflowShapeLiveState retry reconciliation (GHE #344)", () => {
  it("offers canResume + isRetry on a failed run and keeps the optimistic status after the click", async () => {
    let resolveControl: ((value: { status: "running" }) => void) | undefined;
    const onControlWorkflow = () =>
      new Promise<{ status: "running" }>((resolve) => {
        resolveControl = resolve;
      });

    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    mountedRoots.push({ root, container });

    await act(async () => {
      root.render(
        <Harness workflowRunStatus={FAILED_STATUS} onControlWorkflow={onControlWorkflow} />,
      );
    });
    expect(latest?.status).toBe("failed");
    expect(latest?.canResume).toBe(true);
    expect(latest?.isRetry).toBe(true);
    // A failed run has no live controller to stop until the retry starts.
    expect(latest?.canStop).toBe(false);

    await act(async () => {
      void latest?.control("resume");
    });
    await act(async () => {
      resolveControl?.({ status: "running" });
    });
    expect(latest?.status).toBe("running");

    // Server still reports the OLD failed run (same updatedAt) — the optimistic value must not
    // flash back to "failed".
    await act(async () => {
      root.render(
        <Harness workflowRunStatus={FAILED_STATUS} onControlWorkflow={onControlWorkflow} />,
      );
    });
    expect(latest?.status).toBe("running");
  });

  it("reconciles to a NEW failed status once the server run's updatedAt advances past the retry", async () => {
    let resolveControl: ((value: { status: "running" }) => void) | undefined;
    const onControlWorkflow = () =>
      new Promise<{ status: "running" }>((resolve) => {
        resolveControl = resolve;
      });

    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    mountedRoots.push({ root, container });

    await act(async () => {
      root.render(
        <Harness workflowRunStatus={FAILED_STATUS} onControlWorkflow={onControlWorkflow} />,
      );
    });

    await act(async () => {
      void latest?.control("resume");
    });
    await act(async () => {
      resolveControl?.({ status: "running" });
    });
    expect(latest?.status).toBe("running");

    const newFailedStatus: OrchestrationWorkflowRunStatus = {
      ...FAILED_STATUS,
      updatedAt: "2026-07-17T10:05:00.000Z",
    };
    await act(async () => {
      root.render(
        <Harness workflowRunStatus={newFailedStatus} onControlWorkflow={onControlWorkflow} />,
      );
    });

    expect(latest?.status).toBe("failed");
    expect(latest?.canResume).toBe(true);
    expect(latest?.isRetry).toBe(true);
  });

  it("reconciles an optimistic 'running' to the server's 'suspended' (retained-turn retry) when updatedAt advances", async () => {
    let resolveControl: ((value: { status: "suspended" }) => void) | undefined;
    const onControlWorkflow = () =>
      new Promise<{ status: "suspended" }>((resolve) => {
        resolveControl = resolve;
      });

    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    mountedRoots.push({ root, container });

    await act(async () => {
      root.render(
        <Harness workflowRunStatus={FAILED_STATUS} onControlWorkflow={onControlWorkflow} />,
      );
    });
    await act(async () => {
      void latest?.control("resume");
    });
    await act(async () => {
      resolveControl?.({ status: "suspended" });
    });
    expect(latest?.status).toBe("suspended");

    // The re-issued ask parks the row 'suspended' at a newer updatedAt — the server wins.
    const parked: OrchestrationWorkflowRunStatus = {
      ...FAILED_STATUS,
      status: "suspended",
      updatedAt: "2026-07-17T10:05:00.000Z",
    };
    await act(async () => {
      root.render(<Harness workflowRunStatus={parked} onControlWorkflow={onControlWorkflow} />);
    });
    expect(latest?.status).toBe("suspended");
    expect(latest?.canPause).toBe(true);
  });

  it("lets a new 'completed' win immediately (FORCE_SERVER_STATUS) even with a stale updatedAt", async () => {
    const onControlWorkflow = () => new Promise<{ status: "running" }>(() => {});

    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    mountedRoots.push({ root, container });

    await act(async () => {
      root.render(
        <Harness workflowRunStatus={FAILED_STATUS} onControlWorkflow={onControlWorkflow} />,
      );
    });
    await act(async () => {
      void latest?.control("resume");
    });

    // The run completed while the retry request was in flight, before any updatedAt changed.
    const completed: OrchestrationWorkflowRunStatus = {
      ...FAILED_STATUS,
      status: "completed",
    };
    await act(async () => {
      root.render(<Harness workflowRunStatus={completed} onControlWorkflow={onControlWorkflow} />);
    });
    expect(latest?.status).toBe("completed");
    expect(latest?.canResume).toBe(false);
  });
});
