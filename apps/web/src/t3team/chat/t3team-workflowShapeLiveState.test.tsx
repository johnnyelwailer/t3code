// @vitest-environment jsdom

import type { OrchestrationWorkflowRunStatus } from "@t3tools/contracts";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { useT3TeamWorkflowShapeLiveState } from "~/t3team/chat/t3team-workflowShapeLiveState";
import { RUN_ID, TEST_WORKFLOW_SHAPE } from "~/t3team/chat/t3team-messageShapeCardLive.testSupport";

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
  it("keeps the optimistic 'running' status while the server still reports the pre-click failure", async () => {
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
  });
});
