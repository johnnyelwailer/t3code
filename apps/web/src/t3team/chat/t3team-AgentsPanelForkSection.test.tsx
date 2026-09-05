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

  it("orders sub-runs by lifecycle group (running, waiting, settled), never by lastMessageAt", () => {
    const now = Date.now();
    const at = (offsetMinutes: number) => new Date(now + offsetMinutes * 60_000).toISOString();
    // Deliberately reversed against status: the settled (completed) row is the MOST recent, the
    // running row the least recent. Recency must NOT win — the running row comes first even
    // though it's the least recently active, so a lastMessageAt sort would fail this test.
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
    // GHE #304 fold: only the running row is visible up front; the terminal rows
    // collapse into one dim fold row.
    const runningIndex = rows.findIndex((text) => text.includes("Active probe"));
    const foldIndex = rows.findIndex((text) => text.includes("Settled (2)"));
    expect(runningIndex).toBeGreaterThan(-1);
    expect(foldIndex).toBeGreaterThan(runningIndex);
    expect(rows.find((text) => text.includes("Broken build"))).toBeUndefined();
    expect(rows.find((text) => text.includes("Settled work"))).toBeUndefined();
    // Expanding the fold lists the terminal rows oldest-first: 'Broken build'
    // (20m) precedes 'Settled work' (30m) — recency never promotes a terminal row
    // above the fold, but inside the fold the oldest leads.
    click(findButtonByText("Settled (2)"));
    const foldRows = Array.from(container!.querySelectorAll("button")).map(
      (button) => button.textContent ?? "",
    );
    const completedIndex = foldRows.findIndex((text) => text.includes("Settled work"));
    const errorIndex = foldRows.findIndex((text) => text.includes("Broken build"));
    expect(errorIndex).toBeGreaterThan(-1);
    expect(completedIndex).toBeGreaterThan(errorIndex);
  });

  it("folds every non-running sub-run into one 'Settled (N)' row, expandable to the full roster", () => {
    const now = Date.now();
    const at = (offsetMinutes: number) => new Date(now - offsetMinutes * 60_000).toISOString();
    // 14 terminal threads — far beyond the old 10-row cap. Sub-run 13 is the oldest
    // (13m ago) so it leads the fold's oldest-first order.
    const threads = Array.from({ length: 14 }, (_, i) =>
      createThread({
        id: `s-${i}`,
        title: `Sub-run ${i}`,
        status: "completed",
        lastMessageAt: at(i),
        createdAt: at(i),
      }),
    );

    render(
      <T3TeamAgentsPanelForkSection
        childThreadsByParentId={new Map([["root-1", threads]])}
        rootThreadId="root-1"
        onOpenChildThread={() => {}}
        workflowRuns={[]}
        onOpenWorkflowRun={() => {}}
      />,
    );

    // Nothing renders up front — the whole roster sits behind ONE dim fold row.
    expect(container!.textContent).toContain("Settled (14)");
    expect(container!.textContent).not.toContain("Sub-run 0");
    expect(container!.textContent).not.toContain("Sub-run 10");

    click(findButtonByText("Settled (14)"));

    // After expanding, all 14 are visible — the fold replaced the "Show N more" cap.
    expect(container!.textContent).toContain("Sub-run 0");
    expect(container!.textContent).toContain("Sub-run 9");
    expect(container!.textContent).toContain("Sub-run 10");
    expect(container!.textContent).toContain("Sub-run 13");
    expect(
      Array.from(container!.querySelectorAll("button")).some((b) =>
        b.textContent?.includes("Show more"),
      ),
    ).toBe(false);
    // Oldest-first: the oldest row (Sub-run 13) renders before the newest (Sub-run 0).
    const foldRows = Array.from(container!.querySelectorAll("button")).map(
      (button) => button.textContent ?? "",
    );
    expect(foldRows.findIndex((t) => t.includes("Sub-run 13"))).toBeLessThan(
      foldRows.findIndex((t) => t.includes("Sub-run 0")),
    );
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

    // The running row is visible; the terminal rows are hidden behind one fold row.
    expect(container!.textContent).toContain("Active probe");
    expect(container!.textContent).not.toContain("Old triage run");
    expect(container!.textContent).not.toContain("Older probe");
    expect(container!.textContent).toContain("Settled (2)");
    // Oldest (72h) leads the fold label.
    expect(container!.textContent).toContain("oldest 3d ago");

    click(findButtonByText("Settled (2)"));

    expect(container!.textContent).toContain("Older probe");
    expect(container!.textContent).toContain("Old triage run");
    expect(container!.textContent).toContain("collapse");
    // Oldest-first inside the fold: the 72h row precedes the 48h row.
    const foldRows = Array.from(container!.querySelectorAll("button")).map(
      (button) => button.textContent ?? "",
    );
    expect(foldRows.findIndex((t) => t.includes("Older probe"))).toBeLessThan(
      foldRows.findIndex((t) => t.includes("Old triage run")),
    );
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

  it("keeps a settled parent in the fold, and its nested subtree out of the fold's chrome", () => {
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

    // GHE #304: a terminal parent is roster noise — it folds instead of rendering its own
    // expanded row, and its nested subtree does not expand out of the fold's compact rows.
    expect(container!.textContent).not.toContain("Settled parent");
    expect(container!.textContent).toContain("Settled (1)");

    click(findButtonByText("Settled (1)"));

    expect(container!.textContent).toContain("Settled parent");
    expect(container!.textContent).not.toContain("Nested probe");
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
    // Thread B is terminal, so it sits in the fold (no hang, no render crash).
    expect(container!.textContent).toContain("Settled (1)");
    click(findButtonByText("Settled (1)"));
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
