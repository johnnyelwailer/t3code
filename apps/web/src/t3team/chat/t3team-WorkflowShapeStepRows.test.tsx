// @vitest-environment jsdom
/**
 * Render behavior for the live workflow card's top-level step list truncation (see
 * `t3team-workflowShapeStepRowsPaging.ts`): a short run must still render every entry (no
 * regression from the new head/tail logic), a long run must fold the middle behind an
 * "… N earlier" affordance with the right count, and clicking it must page ten more in.
 */
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { T3TeamWorkflowShapeStepRows } from "~/t3team/chat/t3team-WorkflowShapeStepRows";
import type { T3TeamWorkflowShapeProgressRow } from "~/t3team/chat/t3team-workflowShapeProgress";
import { WORKFLOW_TOP_PAGE_SIZE } from "~/t3team/chat/t3team-workflowShapeStepRowsPaging";

const mountedRoots: Array<{ root: ReturnType<typeof createRoot>; container: HTMLElement }> = [];

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

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
});

// Each row lives in its OWN phase bucket so `groupDynamicRuntimeRows` never folds them into a
// dynamic group — one row in, one top-level render unit out, which is what makes the counts below
// assertable.
function row(index: number): T3TeamWorkflowShapeProgressRow {
  return {
    phase: `Phase ${String(index)}`,
    runtimeStep: {
      stepId: `run:${String(index)}`,
      seq: index,
      stepKind: "thread.turn",
      phase: "completed",
      detail: `Step ${String(index)}`,
    },
  };
}

function renderRows(count: number) {
  return renderNode(
    <T3TeamWorkflowShapeStepRows
      rows={Array.from({ length: count }, (_, index) => row(index))}
      status="completed"
      scheduledPlanRow={-1}
      activeWaitAt={undefined}
    />,
  );
}

describe("T3TeamWorkflowShapeStepRows truncation", () => {
  it("renders every entry for a short run", async () => {
    const container = await renderRows(6);
    for (let index = 0; index < 6; index += 1) {
      expect(container.textContent).toContain(`Step ${String(index)}`);
    }
    expect(container.querySelector("[data-workflow-steps-earlier]")).toBeNull();
  });

  it("folds a long run's middle behind the earlier affordance with the right count", async () => {
    const container = await renderRows(20);

    expect(container.textContent).toContain("Step 0");
    expect(container.textContent).toContain("Step 2");
    expect(container.textContent).toContain("Step 17");
    expect(container.textContent).toContain("Step 19");
    expect(container.textContent).not.toContain("Step 10");

    const earlier = container.querySelector("[data-workflow-steps-earlier]");
    expect(earlier?.getAttribute("data-workflow-steps-earlier")).toBe("14");
    expect(earlier?.textContent).toContain("14 earlier");
  });

  it("pages ten more in when the earlier affordance is clicked", async () => {
    const container = await renderRows(30);
    const button = container.querySelector<HTMLButtonElement>("[data-workflow-steps-earlier]");
    expect(button?.getAttribute("data-workflow-steps-earlier")).toBe(String(30 - 3 - 3));
    expect(container.textContent).not.toContain("Step 17");

    await act(async () => {
      button?.click();
    });

    const afterClick = container.querySelector("[data-workflow-steps-earlier]");
    expect(afterClick?.getAttribute("data-workflow-steps-earlier")).toBe(
      String(30 - 3 - 3 - WORKFLOW_TOP_PAGE_SIZE),
    );
    expect(container.textContent).toContain("Step 17");
    expect(container.textContent).not.toContain("Step 5");
  });
});
