import type { OrchestrationWorkflowRunStatus } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { T3TeamWorkflowShapeLiveCard } from "~/t3team/chat/t3team-messageShapeCardLive";
import { RUN_ID, TEST_WORKFLOW_SHAPE } from "~/t3team/chat/t3team-messageShapeCardLive.testSupport";
import type { T3TeamWorkflowRunProgress } from "~/t3team/chat/t3team-threadWorkflowStepProgress";
import { terminalRunEventStatus } from "~/t3team/chat/t3team-workflowRunEffectiveStatus";

// The machine-setup repro: "Run failed" landed while the server row still said "running".
const FAILED_AT = "2026-11-10T15:40:00.000Z";
const FAILED: T3TeamWorkflowRunProgress = {
  runId: RUN_ID,
  steps: [],
  run: {
    phase: "failed",
    error: "Provider instance 'nexplore' has no declared default model.",
    updatedAt: FAILED_AT,
  },
};
const row = (
  status: OrchestrationWorkflowRunStatus["status"],
  updatedAt: string,
): OrchestrationWorkflowRunStatus => ({
  runId: RUN_ID,
  status,
  pendingKind: null,
  wakeAt: null,
  updatedAt,
});

describe("a failed run never shows Running", () => {
  it("renders the card as Failed while the server row is still running", () => {
    const markup = renderToStaticMarkup(
      <T3TeamWorkflowShapeLiveCard
        shape={TEST_WORKFLOW_SHAPE}
        progress={FAILED}
        workflowRunStatus={row("running", "2026-11-10T15:39:00.000Z")}
      />,
    );
    expect(markup).toContain("Failed");
    expect(markup).not.toContain("Running");
  });

  it("lets the run event win only while it is at least as fresh as the server row", () => {
    expect(terminalRunEventStatus(FAILED, undefined)).toBe("failed");
    expect(terminalRunEventStatus(FAILED, row("running", FAILED_AT))).toBe("failed");
    // A Retry re-drive moved the row on: it wins.
    expect(terminalRunEventStatus(FAILED, row("running", "2026-11-10T15:41:00.000Z"))).toBe(
      undefined,
    );
  });

  it("leaves terminal rows, live runs and undated events alone", () => {
    expect(terminalRunEventStatus(FAILED, row("completed", FAILED_AT))).toBeUndefined();
    expect(terminalRunEventStatus({ run: { phase: "started" } }, row("running", FAILED_AT))).toBe(
      undefined,
    );
    expect(terminalRunEventStatus({ run: { phase: "failed" } }, row("running", FAILED_AT))).toBe(
      undefined,
    );
  });
});
