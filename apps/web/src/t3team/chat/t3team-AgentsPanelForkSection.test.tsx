// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { T3TeamActiveWorkflowDockItem } from "~/t3team/chat/t3team-activeWorkflowDock";
import type { ProjectThread } from "~/t3team/t3team-types";
import { T3TeamAgentsPanelForkSection } from "./t3team-AgentsPanelForkSection";

function createThread(overrides: Partial<ProjectThread> = {}): ProjectThread {
  return {
    id: overrides.id ?? "child-1",
    projectId: overrides.projectId ?? "project-1",
    title: overrides.title ?? "Sub-run thread",
    status: overrides.status ?? "running",
    messageCount: overrides.messageCount ?? 0,
    lastMessageAt: overrides.lastMessageAt ?? new Date().toISOString(),
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    ...overrides,
  };
}

function createWorkflowRun(
  overrides: Partial<T3TeamActiveWorkflowDockItem> = {},
): T3TeamActiveWorkflowDockItem {
  return {
    runId: overrides.runId ?? "run-1",
    messageId: overrides.messageId ?? ("message-1" as T3TeamActiveWorkflowDockItem["messageId"]),
    name: overrides.name ?? "Nightly triage",
    summaries: overrides.summaries ?? ["Active: agent"],
  };
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(element: Parameters<Root["render"]>[0]) {
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container!);
    root!.render(element);
  });
}

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  if (container) {
    container.remove();
    container = null;
  }
});

describe("T3TeamAgentsPanelForkSection", () => {
  it("renders nothing when there are no sub-runs and no workflow runs", () => {
    render(
      <T3TeamAgentsPanelForkSection
        childThreads={[]}
        onOpenChildThread={() => {}}
        workflowRuns={[]}
        onOpenWorkflowRun={() => {}}
      />,
    );
    expect(container!.querySelector("[data-t3team-agents-panel-fork-section]")).toBeNull();
  });

  it("lists sub-run child threads and navigates via onOpenChildThread on click", () => {
    const onOpenChildThread = vi.fn();
    const thread = createThread({ id: "child-9", projectId: "proj-9", title: "Investigate flake" });

    render(
      <T3TeamAgentsPanelForkSection
        childThreads={[thread]}
        onOpenChildThread={onOpenChildThread}
        workflowRuns={[]}
        onOpenWorkflowRun={() => {}}
      />,
    );

    expect(container!.textContent).toContain("Investigate flake");
    const button = container!.querySelector("button")!;
    act(() => button.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onOpenChildThread).toHaveBeenCalledWith({ projectId: "proj-9", threadId: "child-9" });
  });

  it("lists recipe workflow runs and opens them via onOpenWorkflowRun on click", () => {
    const onOpenWorkflowRun = vi.fn();
    const run = createWorkflowRun({ name: "Nightly triage" });

    render(
      <T3TeamAgentsPanelForkSection
        childThreads={[]}
        onOpenChildThread={() => {}}
        workflowRuns={[run]}
        onOpenWorkflowRun={onOpenWorkflowRun}
      />,
    );

    expect(container!.textContent).toContain("Nightly triage");
    const button = container!.querySelector("button")!;
    act(() => button.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onOpenWorkflowRun).toHaveBeenCalledWith(run);
  });
});
