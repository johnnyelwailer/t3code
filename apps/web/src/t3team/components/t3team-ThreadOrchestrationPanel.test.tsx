// @vitest-environment jsdom
import type {
  EnvironmentId,
  OrchestrationWorkflowRunStatus,
  T3TeamThreadFacts,
  ThreadId,
} from "@t3tools/contracts";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { T3TeamActiveWorkflowDockItem } from "~/t3team/chat/t3team-activeWorkflowDock";

const factsRef = vi.hoisted(() => ({ current: undefined as T3TeamThreadFacts | undefined }));
vi.mock("~/state/t3team-threadSideStreams", () => ({
  useT3TeamThreadFacts: () => factsRef.current,
}));

const { ThreadOrchestrationPanel } =
  await import("~/t3team/components/t3team-ThreadOrchestrationPanel");

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const ENV = "env-1" as unknown as EnvironmentId;
const THREAD = "thread-1" as unknown as ThreadId;

function facts(
  status: string,
  runExtra?: Partial<OrchestrationWorkflowRunStatus>,
): T3TeamThreadFacts {
  return {
    threadId: THREAD,
    workflowRunStatus: {
      runId: "run-1",
      status,
      pendingKind: null,
      wakeAt: null,
      updatedAt: "2026-07-17T10:00:00.000Z",
      ...runExtra,
    },
    updatedAt: "2026-07-17T10:00:00.000Z",
  } as unknown as T3TeamThreadFacts;
}

const roots: Array<{ root: ReturnType<typeof createRoot>; container: HTMLElement }> = [];
async function render(node: ReactNode): Promise<HTMLElement> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  await act(async () => {
    root.render(node);
  });
  return container;
}
afterEach(async () => {
  while (roots.length > 0) {
    const mounted = roots.pop()!;
    await act(async () => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }
  document.body.innerHTML = "";
  factsRef.current = undefined;
});

describe("ThreadOrchestrationPanel", () => {
  it("renders nothing when the thread has no run (idle)", async () => {
    factsRef.current = undefined;
    const container = await render(
      <ThreadOrchestrationPanel environmentId={ENV} threadId={THREAD} dockItems={[]} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing for a 'watching' run that has no pill of its own", async () => {
    factsRef.current = facts("watching");
    const container = await render(
      <ThreadOrchestrationPanel environmentId={ENV} threadId={THREAD} dockItems={[]} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("shows the honest authoring copy, never the capacity-queued line", async () => {
    factsRef.current = facts("authoring");
    const container = await render(
      <ThreadOrchestrationPanel environmentId={ENV} threadId={THREAD} dockItems={[]} />,
    );
    expect(container.textContent).toContain("Authoring the orchestration");
    expect(container.textContent).not.toContain("capacity");
    expect(
      container
        .querySelector("[data-orchestration-status]")
        ?.getAttribute("data-orchestration-status"),
    ).toBe("Working");
  });

  it("shows the capacity line only for a genuinely queued run", async () => {
    factsRef.current = facts("queued");
    const container = await render(
      <ThreadOrchestrationPanel environmentId={ENV} threadId={THREAD} dockItems={[]} />,
    );
    expect(container.textContent).toContain("Starts when capacity is free");
  });

  it("prefers the loaded shape title, then the durable title, then the generic fallback", async () => {
    factsRef.current = facts("sleeping", { title: "Durable release goal" });
    const dockItem: T3TeamActiveWorkflowDockItem = {
      runId: "run-1",
      messageId: "message-1" as T3TeamActiveWorkflowDockItem["messageId"],
      name: "Shape description",
      summaries: [],
    };
    const withDock = await render(
      <ThreadOrchestrationPanel environmentId={ENV} threadId={THREAD} dockItems={[dockItem]} />,
    );
    expect(withDock.textContent).toContain("Shape description");
    expect(withDock.textContent).not.toContain("Durable release goal");

    factsRef.current = facts("sleeping", { title: "Durable release goal" });
    const durable = await render(
      <ThreadOrchestrationPanel environmentId={ENV} threadId={THREAD} dockItems={[]} />,
    );
    expect(durable.textContent).toContain("Durable release goal");

    factsRef.current = facts("sleeping");
    const fallback = await render(
      <ThreadOrchestrationPanel environmentId={ENV} threadId={THREAD} dockItems={[]} />,
    );
    expect(fallback.textContent?.match(/Orchestration/g)).toHaveLength(1);
  });

  it("does not repeat a sleeping run's wake time in the expanded detail", async () => {
    factsRef.current = facts("sleeping", {
      wakeAt: "2026-07-17T10:00:00.000Z" as OrchestrationWorkflowRunStatus["wakeAt"],
      messageId: "t3team-wf-shape:run-1" as OrchestrationWorkflowRunStatus["messageId"],
    });
    const container = await render(
      <ThreadOrchestrationPanel
        environmentId={ENV}
        threadId={THREAD}
        dockItems={[]}
        onLocate={vi.fn()}
      />,
    );
    await act(async () => {
      container.querySelector<HTMLButtonElement>("[data-orchestration-status] > button")!.click();
    });
    expect(container.querySelector("[data-orchestration-detail]")?.textContent).not.toContain(
      "Wakes",
    );
  });

  it("shows pause and stop for a scheduled run and sends controls through the shared callback", async () => {
    factsRef.current = facts("sleeping");
    const onControl = vi.fn(async () => ({ status: "paused" as const }));
    const container = await render(
      <ThreadOrchestrationPanel
        environmentId={ENV}
        threadId={THREAD}
        dockItems={[]}
        onControl={onControl}
      />,
    );
    const pause = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Pause orchestration"]',
    );
    expect(pause).not.toBeNull();
    expect(
      container.querySelector('button[aria-label="More orchestration actions"]'),
    ).not.toBeNull();
    await act(async () => {
      pause?.click();
    });
    expect(onControl).toHaveBeenCalledWith({ workflowRunId: "run-1", action: "pause" });
  });

  it("hides controls for terminal runs", async () => {
    factsRef.current = facts("completed");
    const container = await render(
      <ThreadOrchestrationPanel
        environmentId={ENV}
        threadId={THREAD}
        dockItems={[]}
        onControl={vi.fn()}
      />,
    );
    expect(container.querySelector('button[aria-label="Pause orchestration"]')).toBeNull();
    expect(container.querySelector('button[aria-label="More orchestration actions"]')).toBeNull();
  });

  it("locates the durable launch message when no dock item is loaded", async () => {
    factsRef.current = facts("sleeping", {
      messageId: "t3team-wf-shape:run-1" as OrchestrationWorkflowRunStatus["messageId"],
    });
    const onLocate = vi.fn();
    const container = await render(
      <ThreadOrchestrationPanel
        environmentId={ENV}
        threadId={THREAD}
        dockItems={[]}
        onLocate={onLocate}
      />,
    );
    const toggle = container.querySelector<HTMLButtonElement>(
      "[data-orchestration-status] > button",
    )!;
    await act(async () => {
      toggle.click();
    });
    const locate = container.querySelector<HTMLButtonElement>(
      "[data-orchestration-detail] button",
    )!;
    await act(async () => {
      locate.click();
    });
    expect(onLocate).toHaveBeenCalledWith({ messageId: "t3team-wf-shape:run-1" });
  });

  it("hides step detail until expanded, then reveals it on click", async () => {
    factsRef.current = facts("suspended");
    const dockItem: T3TeamActiveWorkflowDockItem = {
      runId: "run-1",
      messageId: "message-1" as T3TeamActiveWorkflowDockItem["messageId"],
      name: "Release train",
      summaries: ["Waiting: Merge it?"],
    };
    const onLocate = vi.fn();
    const container = await render(
      <ThreadOrchestrationPanel
        environmentId={ENV}
        threadId={THREAD}
        dockItems={[dockItem]}
        onLocate={onLocate}
      />,
    );
    expect(container.textContent).toContain("Release train");
    expect(container.querySelector("[data-orchestration-detail]")).toBeNull();

    const toggle = container.querySelector<HTMLButtonElement>(
      "[data-orchestration-status] > button",
    )!;
    await act(async () => {
      toggle.click();
    });
    expect(container.querySelector("[data-orchestration-detail]")).not.toBeNull();
    expect(container.textContent).toContain("Waiting: Merge it?");

    const locate = container.querySelector<HTMLButtonElement>(
      "[data-orchestration-detail] button",
    )!;
    await act(async () => {
      locate.click();
    });
    expect(onLocate).toHaveBeenCalledWith({ messageId: dockItem.messageId });
  });
});
