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

function click(element: Element) {
  act(() => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

function findButtonByText(text: string): HTMLButtonElement {
  const button = Array.from(container!.querySelectorAll("button")).find((candidate) =>
    candidate.textContent?.includes(text),
  );
  expect(button, `button containing "${text}"`).toBeTruthy();
  return button!;
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
        childThreadsByParentId={new Map()}
        rootThreadId="root-1"
        onOpenChildThread={() => {}}
        workflowRuns={[]}
        onOpenWorkflowRun={() => {}}
      />,
    );
    expect(container!.querySelector("[data-t3team-agents-panel-fork-section]")).toBeNull();
  });

  it("renders nothing when there is no root thread to descend from", () => {
    const thread = createThread({ id: "child-1" });
    render(
      <T3TeamAgentsPanelForkSection
        childThreadsByParentId={new Map([["other-root", [thread]]])}
        rootThreadId={null}
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
        childThreadsByParentId={new Map([["root-1", [thread]]])}
        rootThreadId="root-1"
        onOpenChildThread={onOpenChildThread}
        workflowRuns={[]}
        onOpenWorkflowRun={() => {}}
      />,
    );

    expect(container!.textContent).toContain("Investigate flake");
    click(findButtonByText("Investigate flake"));
    expect(onOpenChildThread).toHaveBeenCalledWith({ projectId: "proj-9", threadId: "child-9" });
  });

  it("orders sub-runs by status priority: running, then error, then completed", () => {
    const now = Date.now();
    const at = (offsetMinutes: number) => new Date(now + offsetMinutes * 60_000).toISOString();
    // Deliberately reversed recency: the idle-ish settled rows are the most recent, so a
    // pure "most recent first" sort would fail this test.
    const completed = createThread({
      id: "c-1",
      title: "Settled work",
      status: "completed",
      lastMessageAt: at(30),
    });
    const error = createThread({
      id: "e-1",
      title: "Broken build",
      status: "error",
      lastMessageAt: at(20),
    });
    const running = createThread({
      id: "r-1",
      title: "Active probe",
      status: "running",
      lastMessageAt: at(10),
    });

    render(
      <T3TeamAgentsPanelForkSection
        childThreadsByParentId={new Map([["root-1", [completed, error, running]]])}
        rootThreadId="root-1"
        onOpenChildThread={() => {}}
        workflowRuns={[]}
        onOpenWorkflowRun={() => {}}
      />,
    );

    const rows = Array.from(container!.querySelectorAll("button")).map(
      (button) => button.textContent ?? "",
    );
    const runningIndex = rows.findIndex((text) => text.includes("Active probe"));
    const errorIndex = rows.findIndex((text) => text.includes("Broken build"));
    const completedIndex = rows.findIndex((text) => text.includes("Settled work"));
    expect(runningIndex).toBeGreaterThan(-1);
    expect(errorIndex).toBeGreaterThan(runningIndex);
    expect(completedIndex).toBeGreaterThan(errorIndex);
  });

  it("collapses idle sub-runs into a single disclosure row and expands on click", () => {
    const now = Date.now();
    const at = (offsetHours: number) => new Date(now - offsetHours * 3_600_000).toISOString();
    const staleA = createThread({
      id: "idle-1",
      title: "Old triage run",
      status: "idle",
      lastMessageAt: at(48),
    });
    const staleB = createThread({
      id: "idle-2",
      title: "Older probe",
      status: "idle",
      lastMessageAt: at(72),
    });
    const running = createThread({ id: "r-1", title: "Active probe", status: "running" });

    render(
      <T3TeamAgentsPanelForkSection
        childThreadsByParentId={new Map([["root-1", [staleA, staleB, running]]])}
        rootThreadId="root-1"
        onOpenChildThread={() => {}}
        workflowRuns={[]}
        onOpenWorkflowRun={() => {}}
      />,
    );

    // The running row is visible; the idle rows are hidden behind one disclosure.
    expect(container!.textContent).toContain("Active probe");
    expect(container!.textContent).not.toContain("Old triage run");
    expect(container!.textContent).not.toContain("Older probe");
    expect(container!.textContent).toContain("2 idle · expand");

    click(findButtonByText("2 idle · expand"));

    expect(container!.textContent).toContain("Old triage run");
    expect(container!.textContent).toContain("Older probe");
    expect(container!.textContent).toContain("2 idle · collapse");
  });

  it("renders nested sub-runs indented under their parent, open by default while the parent runs", () => {
    const parent = createThread({ id: "parent-1", title: "Parent run", status: "running" });
    const child = createThread({ id: "child-1", title: "Nested probe", status: "running" });

    render(
      <T3TeamAgentsPanelForkSection
        childThreadsByParentId={
          new Map([
            ["root-1", [parent]],
            ["parent-1", [child]],
          ])
        }
        rootThreadId="root-1"
        onOpenChildThread={() => {}}
        workflowRuns={[]}
        onOpenWorkflowRun={() => {}}
      />,
    );

    // A running parent is expanded by default, so the nested row is visible.
    expect(container!.textContent).toContain("Nested probe");
    // The nested row lives in the indented subtree container, not at the top level.
    const nestedRow = Array.from(container!.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Nested probe"),
    )!;
    expect(nestedRow.closest(".ml-3.border-l")).toBeTruthy();
    // The parent row carries a collapse toggle.
    expect(
      findButtonByText("Parent run").previousElementSibling?.getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("keeps a settled parent's subtree collapsed by default and expands it on toggle", () => {
    const parent = createThread({ id: "parent-1", title: "Settled parent", status: "completed" });
    const child = createThread({ id: "child-1", title: "Nested probe", status: "completed" });

    render(
      <T3TeamAgentsPanelForkSection
        childThreadsByParentId={
          new Map([
            ["root-1", [parent]],
            ["parent-1", [child]],
          ])
        }
        rootThreadId="root-1"
        onOpenChildThread={() => {}}
        workflowRuns={[]}
        onOpenWorkflowRun={() => {}}
      />,
    );

    expect(container!.textContent).toContain("Settled parent");
    expect(container!.textContent).not.toContain("Nested probe");

    const toggle = findButtonByText("Settled parent").previousElementSibling as HTMLButtonElement;
    expect(toggle.getAttribute("aria-label")).toBe("Expand sub-runs");
    click(toggle);
    expect(container!.textContent).toContain("Nested probe");
  });

  it("survives a cyclic parent relation without hanging", () => {
    const a = createThread({ id: "a", title: "Thread A", status: "running" });
    const b = createThread({ id: "b", title: "Thread B", status: "completed" });
    render(
      <T3TeamAgentsPanelForkSection
        childThreadsByParentId={
          new Map([
            ["root-1", [a]],
            ["a", [b]],
            ["b", [a]],
          ])
        }
        rootThreadId="root-1"
        onOpenChildThread={() => {}}
        workflowRuns={[]}
        onOpenWorkflowRun={() => {}}
      />,
    );
    expect(container!.textContent).toContain("Thread A");
    expect(container!.textContent).toContain("Thread B");
  });

  it("lists recipe workflow runs and opens them via onOpenWorkflowRun on click", () => {
    const onOpenWorkflowRun = vi.fn();
    const run = createWorkflowRun({ name: "Nightly triage" });

    render(
      <T3TeamAgentsPanelForkSection
        childThreadsByParentId={new Map()}
        rootThreadId="root-1"
        onOpenChildThread={() => {}}
        workflowRuns={[run]}
        onOpenWorkflowRun={onOpenWorkflowRun}
      />,
    );

    expect(container!.textContent).toContain("Nightly triage");
    click(findButtonByText("Nightly triage"));
    expect(onOpenWorkflowRun).toHaveBeenCalledWith(run);
  });
});
