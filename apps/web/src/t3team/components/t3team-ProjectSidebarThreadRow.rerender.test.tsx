// @vitest-environment jsdom
/**
 * Regression test — selecting a thread must NOT re-render the whole Work-lens
 * sidebar list.
 *
 * Root cause (measured, pre-fix): the Work-lens list call sites
 * (`ProjectSidebarProjectThreadSection`, `ProjectSidebarThreadTreeRows`,
 * `ProjectSidebarTicketEntry`) passed each memoized `ThreadRow` a fresh
 * `state` object and fresh `onSelect`/`onDelete`/`onRename` closures on every
 * render of the list. Because those props changed identity on each render, the
 * row's `memo` never bailed out, so selecting a thread re-rendered EVERY
 * visible row (measured: 12/12 rows; ~2.4 s of cascaded effect chains in the
 * owner's React-DevTools trace).
 *
 * Fix: the call sites now render `ProjectSidebarThreadRowItem`, a memo barrier
 * that receives only referentially-stable props (the thread object, a
 * primitive `isSelected`, and the stable list handlers) and builds the per-row
 * `state` + closures inside. A row therefore re-renders only when its own
 * selection changes.
 *
 * This test renders the real `ProjectSidebarThreadRowItem` the way the fixed
 * call sites do (primitive `isSelected` + stable handlers) and asserts that
 * selecting a different thread re-renders only the two affected rows — not the
 * whole list.
 */
import { act, memo, useMemo } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { ProjectSidebarThreadRowItem } from "./t3team-ProjectSidebarThreadRow";
import type { ProjectThread } from "~/t3team/t3team-types";

vi.mock("~/localApi", () => ({ readLocalApi: () => null }));

function makeThread(index: number): ProjectThread {
  return {
    id: `thread-${index}`,
    projectId: "project-1",
    title: `Thread ${index}`,
    lastMessageAt: "2026-03-09T10:00:00.000Z",
  } as unknown as ProjectThread;
}

const ROW_COUNT = 12;

// Counts how many times each row re-renders. The wrapper receives the SAME
// stable props the fixed call site passes to `ProjectSidebarThreadRowItem`
// (a primitive `isSelected` + stable handlers), so it bails out exactly when
// the fixed row does.
const renderCounts = new Map<string, number>();
const stableOnSelect = () => {};
const stableOnDelete = () => {};
const stableOnRename = () => {};
const CountingRow = memo(function CountingRow(props: {
  rowId: string;
  thread: ProjectThread;
  isSelected: boolean;
}) {
  renderCounts.set(props.rowId, (renderCounts.get(props.rowId) ?? 0) + 1);
  return (
    <ProjectSidebarThreadRowItem
      thread={props.thread}
      isSelected={props.isSelected}
      workspacePath={null}
      projectId="project-1"
      onSelectThread={stableOnSelect}
      onDeleteThread={stableOnDelete}
      onRenameThread={stableOnRename}
      wrapWithMenuItem={false}
    />
  );
});

function Harness({ activeThreadId }: { activeThreadId: string | null }) {
  const threads = useMemo(() => Array.from({ length: ROW_COUNT }, (_, i) => makeThread(i)), []);
  return (
    <div>
      {threads.map((thread, index) => (
        <CountingRow
          key={thread.id}
          rowId={`row-${index}`}
          thread={thread}
          isSelected={activeThreadId === thread.id}
        />
      ))}
    </div>
  );
}

describe("Work-lens thread selection re-render regression", () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    renderCounts.clear();
  });

  it("mounts every row exactly once", async () => {
    await act(async () => {
      root.render(<Harness activeThreadId="thread-0" />);
    });
    for (let i = 0; i < ROW_COUNT; i += 1) {
      expect(renderCounts.get(`row-${i}`)).toBe(1);
    }
  });

  it("selecting a different thread re-renders only the two affected rows, not the list", async () => {
    await act(async () => {
      root.render(<Harness activeThreadId="thread-0" />);
    });
    renderCounts.clear();

    await act(async () => {
      root.render(<Harness activeThreadId="thread-1" />);
    });

    const reRendered = [...renderCounts.entries()]
      .filter(([, count]) => count > 0)
      .map(([rowId]) => rowId)
      .toSorted();

    // Pre-fix this was ALL 12 rows (["row-0".."row-11"]). The fix must keep it
    // to just the row that was selected and the row that was deselected.
    expect(reRendered).toEqual(["row-0", "row-1"]);
  });
});
