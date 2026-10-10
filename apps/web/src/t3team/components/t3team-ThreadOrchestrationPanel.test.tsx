// @vitest-environment jsdom
import type { EnvironmentId, T3TeamThreadFacts, ThreadId } from "@t3tools/contracts";
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

function facts(status: string, extra?: Partial<T3TeamThreadFacts>): T3TeamThreadFacts {
  return {
    threadId: THREAD,
    workflowRunStatus: {
      runId: "run-1",
      status,
      pendingKind: null,
      wakeAt: null,
      updatedAt: "2026-07-17T10:00:00.000Z",
    },
    updatedAt: "2026-07-17T10:00:00.000Z",
    ...extra,
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

    const toggle = container.querySelector<HTMLButtonElement>("[data-orchestration-status]")!;
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
    expect(onLocate).toHaveBeenCalledWith(dockItem);
  });
});
