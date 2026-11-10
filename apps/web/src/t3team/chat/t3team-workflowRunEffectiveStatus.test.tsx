// @vitest-environment jsdom
/**
 * A failed run never shows "Running" (nx-nexi machine-setup repro): the "Run failed: …" event
 * landed while the server row still said "running", and the card drew both at once.
 */
import type { OrchestrationWorkflowRunStatus } from "@t3tools/contracts";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { RUN_ID, TEST_WORKFLOW_SHAPE } from "~/t3team/chat/t3team-messageShapeCardLive.testSupport";
import type { T3TeamWorkflowRunProgress } from "~/t3team/chat/t3team-threadWorkflowStepProgress";
import { terminalRunEventStatus } from "~/t3team/chat/t3team-workflowRunEffectiveStatus";
import { useT3TeamWorkflowShapeLiveState } from "~/t3team/chat/t3team-workflowShapeLiveState";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const FAILED_AT = "2026-11-10T15:40:00.000Z";
const FAILED_PROGRESS: T3TeamWorkflowRunProgress = {
  runId: RUN_ID,
  steps: [],
  run: {
    phase: "failed",
    error: "Provider instance 'nexplore' has no declared default model.",
    updatedAt: FAILED_AT,
  },
};
const serverRow = (
  status: OrchestrationWorkflowRunStatus["status"],
  updatedAt: string,
): OrchestrationWorkflowRunStatus => ({
  runId: RUN_ID,
  status,
  pendingKind: null,
  wakeAt: null,
  updatedAt,
});

const roots: Array<ReturnType<typeof createRoot>> = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  document.body.innerHTML = "";
});

let latest: ReturnType<typeof useT3TeamWorkflowShapeLiveState> | undefined;
function Harness(props: { workflowRunStatus?: OrchestrationWorkflowRunStatus }) {
  latest = useT3TeamWorkflowShapeLiveState({
    shape: TEST_WORKFLOW_SHAPE,
    progress: FAILED_PROGRESS,
    ...(props.workflowRunStatus ? { workflowRunStatus: props.workflowRunStatus } : {}),
  });
  return null;
}

async function render(workflowRunStatus?: OrchestrationWorkflowRunStatus) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(<Harness {...(workflowRunStatus ? { workflowRunStatus } : {})} />);
  });
  return latest!;
}

describe("a failed run never shows Running", () => {
  it("lets the failed run event win over a stale 'running' server row", async () => {
    const state = await render(serverRow("running", "2026-11-10T15:39:00.000Z"));
    expect(state.status).toBe("failed");
    expect(state.liveLabel).toBe("Failed");
    expect(state.liveLabel).not.toBe("Running");
  });

  it("shows Failed with no server row at all", async () => {
    const state = await render();
    expect(state.liveLabel).toBe("Failed");
  });

  it("follows a newer server row (a Retry re-drive already started)", () => {
    expect(
      terminalRunEventStatus(FAILED_PROGRESS, serverRow("running", "2026-11-10T15:41:00.000Z")),
    ).toBeUndefined();
    expect(terminalRunEventStatus(FAILED_PROGRESS, serverRow("running", FAILED_AT))).toBe("failed");
  });

  it("leaves a terminal server row, a live run and an undated event alone", () => {
    expect(
      terminalRunEventStatus({ run: { phase: "failed" } }, serverRow("running", FAILED_AT)),
    ).toBeUndefined();
    expect(
      terminalRunEventStatus(FAILED_PROGRESS, serverRow("completed", FAILED_AT)),
    ).toBeUndefined();
    expect(
      terminalRunEventStatus({ run: { phase: "started" } }, serverRow("running", FAILED_AT)),
    ).toBeUndefined();
  });
});
