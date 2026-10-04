// @vitest-environment jsdom
/**
 * Render coverage for `T3TeamWorkflowShapeDynamicGroupRow` (GHE #414): same-label loop iterations
 * are not retries of one step, so a small group must render through the same collapsed form as a
 * large one — no "Attempt N" children, no `↻N` badge.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { T3TeamWorkflowShapeDynamicGroupRow } from "~/t3team/chat/t3team-workflowShapeStepGrouping";
import type { DynamicRow } from "~/t3team/chat/t3team-workflowShapeStepGrouping";

function dynamicRow(stepId: string): DynamicRow {
  return {
    runtimeStep: {
      stepId,
      seq: null,
      stepKind: "thread.turn",
      phase: "completed",
      detail: "Count step",
    },
  } as DynamicRow;
}

describe("T3TeamWorkflowShapeDynamicGroupRow", () => {
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    if (container) {
      document.body.removeChild(container);
      container = null;
    }
  });

  it("renders 2 same-label iterations as one collapsed group with no Attempt text", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <T3TeamWorkflowShapeDynamicGroupRow
          label="Count step"
          rows={[dynamicRow("run:1"), dynamicRow("run:2")]}
          status="completed"
        />,
      );
    });

    const text = container.textContent ?? "";
    expect(text).toContain("Count step · 2/2");
    expect(text).not.toContain("Attempt");
    expect(container.querySelector("details")).not.toBeNull();
    expect(text).not.toContain("↻");

    act(() => {
      root.unmount();
    });
  });
});
