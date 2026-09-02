// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { T3TeamWorkflowRunControls } from "~/t3team/chat/t3team-workflowRunControls";

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

async function dispatchClick(target: Element) {
  await act(async () => {
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

function getMenuItemLabels() {
  return [...document.body.querySelectorAll("[data-slot='menu-item']")].map(
    (node) => node.textContent ?? "",
  );
}

afterEach(async () => {
  while (mountedRoots.length > 0) {
    const mounted = mountedRoots.pop();
    if (!mounted) {
      continue;
    }

    await act(async () => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }

  document.body.innerHTML = "";
});

const CAPABILITIES = [
  { kind: "feature" as const, id: "user" },
  { kind: "feature" as const, id: "script" },
];

describe("T3TeamWorkflowRunControls", () => {
  it("renders a capability-disclosure trigger with no stop item when there is no onControl", async () => {
    const container = await renderNode(
      <T3TeamWorkflowRunControls
        canPause={false}
        canResume={false}
        canStop={false}
        pending={null}
        className="controls"
        capabilities={CAPABILITIES}
      />,
    );

    const trigger = container.querySelector("[aria-label='What this run may do']");
    expect(trigger).toBeTruthy();

    await dispatchClick(trigger as Element);

    const labels = getMenuItemLabels();
    expect(labels.some((label) => label.includes("Stop workflow"))).toBe(false);

    const bodyText = document.body.textContent ?? "";
    expect(bodyText).toContain("Ask & notify you");
    expect(bodyText).toContain("Run recipe scripts");
  });

  it('shows the stop item above the capability group and fires onControl("stop") when clicked', async () => {
    const onControl = vi.fn();
    const container = await renderNode(
      <T3TeamWorkflowRunControls
        canPause={false}
        canResume={false}
        canStop={true}
        pending={null}
        className="controls"
        onControl={onControl}
        capabilities={CAPABILITIES}
      />,
    );

    const trigger = container.querySelector("[aria-label='More orchestration actions']");
    expect(trigger).toBeTruthy();

    await dispatchClick(trigger as Element);

    const items = [...document.body.querySelectorAll("[data-slot='menu-item']")];
    const stopIndex = items.findIndex((node) => (node.textContent ?? "").includes("Stop workflow"));
    expect(stopIndex).toBe(0);

    await dispatchClick(items[stopIndex] as Element);

    expect(onControl).toHaveBeenCalledWith("stop");
  });

  it('labels the resume control "Retry run" for a failed, resumable run', async () => {
    const onControl = vi.fn();
    const container = await renderNode(
      <T3TeamWorkflowRunControls
        canPause={false}
        canResume={true}
        canStop={false}
        isRetry={true}
        pending={null}
        className="controls"
        onControl={onControl}
      />,
    );

    const trigger = container.querySelector("[aria-label='Retry run']");
    expect(trigger).toBeTruthy();
    expect(container.querySelector("[aria-label='Resume orchestration']")).toBeNull();

    await dispatchClick(trigger as Element);
    expect(onControl).toHaveBeenCalledWith("resume");
  });

  it("renders nothing when there are no capabilities, no controls, and no stop affordance", async () => {
    const container = await renderNode(
      <T3TeamWorkflowRunControls
        canPause={false}
        canResume={false}
        canStop={false}
        pending={null}
        className="controls"
      />,
    );

    expect(container.innerHTML).toBe("");
  });
});
