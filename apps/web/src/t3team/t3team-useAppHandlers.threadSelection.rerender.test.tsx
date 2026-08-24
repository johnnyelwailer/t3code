// @vitest-environment jsdom
/**
 * Regression test — selecting a thread must NOT re-render the whole Work-lens
 * thread list. This test exercises the REAL wiring that the isolated
 * `t3team-ProjectSidebarThreadRow.rerender.test.tsx` could not:
 *
 * - the real `useProjectStore()`,
 * - the real `useAppHandlers()` — whose `handleSelectThread` /
 *   `handleDeleteThread` used to depend on the whole `store` object, on the
 *   volatile `activeView`, and on the `onOpen*` callbacks that the route
 *   surface regenerates as inline arrows on every navigation,
 * - the real `ProjectSidebarThreadRowItem` memo barrier,
 * - the real selection flow: clicking a row calls `handleSelectThread`, which
 *   mutates the store's `view` AND updates the route-level view (like
 *   `T3TeamRouteSurface`'s `onOpenThread` navigation does).
 *
 * Pre-fix measurement: selecting a thread re-rendered ALL 12 rows (12/12) —
 * the selection changed the store's `view`, which changed the `store` object
 * identity, which changed the handler identities handed to the memo barrier,
 * so no row could bail out. Post-fix: only the two affected rows re-render
 * (the one selected and the one deselected) — 2/12.
 */
import { act, memo, useMemo, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { ProjectShellProject } from "@t3tools/project-context";

import { ProjectSidebarThreadRowItem } from "~/t3team/components/t3team-ProjectSidebarThreadRow";
import { useProjectStore } from "~/t3team/hooks/t3team-useProjectStore";
import { useAppHandlers } from "~/t3team/t3team-useAppHandlers";
import { resolveViewStoredProject } from "~/t3team/t3team-appMainContentResolution";
import { readActiveThreadIdFromView } from "~/t3team/t3team-types";
import type { ProjectThread, ViewState } from "~/t3team/t3team-types";

// Keep the real store + handlers + barrier; mock only the heavy external
// dependencies so the test stays focused on the real wiring under test.
vi.mock("~/localApi", () => ({ readLocalApi: () => null }));
vi.mock("~/state/environments", () => ({ usePrimaryEnvironmentId: () => null }));
vi.mock("~/state/entities", () => ({ useProjects: () => emptyArray }));
vi.mock("~/t3team/t3team-mergedThreads", () => ({ useMergedThreads: () => emptyArray }));
vi.mock("~/t3team/backend/t3team-index", () => ({
  useBackend: () => null,
  useBackendState: () => backendState,
}));
vi.mock("~/hooks/useThreadActions", () => {
  // One stable `deleteThread` for the whole module registry: `useAppHandlers`
  // depends on its identity, so a fresh mock per hook call would be a false
  // source of instability.
  const deleteThread = vi.fn();
  return { useThreadActions: () => ({ deleteThread }) };
});
vi.mock("~/t3team/hooks/t3team-useLocalWorkspaceCommands", () => {
  const noop = () => {};
  return {
    useLocalWorkspaceCommands: () => ({
      handleDeleteProject: noop,
      handleRenameProject: noop,
    }),
  };
});

const { emptyArray, backendState } = vi.hoisted(() => ({
  emptyArray: [] as unknown[],
  backendState: { connectionStatus: "disconnected" as const },
}));

const ROW_COUNT = 12;
const PROJECT_ID = "project-1";

const renderCounts = new Map<string, number>();
let lastStore: ReturnType<typeof useProjectStore> | null = null;

const CountingRow = memo(function CountingRow(props: {
  rowId: string;
  thread: ProjectThread;
  isSelected: boolean;
  projectId: string;
  onSelectThread: (projectId: string, threadId: string) => void;
  onDeleteThread: (threadId: string) => void;
  onRenameThread: (threadId: string, newTitle: string) => void;
}) {
  renderCounts.set(props.rowId, (renderCounts.get(props.rowId) ?? 0) + 1);
  return (
    <ProjectSidebarThreadRowItem
      thread={props.thread}
      isSelected={props.isSelected}
      workspacePath={null}
      projectId={props.projectId}
      onSelectThread={props.onSelectThread}
      onDeleteThread={props.onDeleteThread}
      onRenameThread={props.onRenameThread}
      wrapWithMenuItem={false}
    />
  );
});

/**
 * Mirrors `t3team-App.tsx` + `T3TeamRouteSurface`:
 * - `activeView = view ?? store.view`, resolved through
 *   `resolveViewStoredProject` exactly like `App` does;
 * - the `onOpen*` callbacks are inline arrows, so they get a FRESH identity on
 *   every render — exactly what the route surface does on every navigation;
 * - `onOpenThread` updates the route-level view, so a selection changes BOTH
 *   the store's `view` state and the route view, like a real navigation.
 */
function Harness() {
  const store = useProjectStore();
  lastStore = store;
  const [routeView, setRouteView] = useState<ViewState | null>(null);
  // Unrelated state so the identity test can force a REAL re-render (React
  // bails out of a no-change `root.render`, which would not re-run the hook).
  const [tick, setTick] = useState(0);
  const activeView = routeView ?? store.view;
  const resolvedView = useMemo(
    () => resolveViewStoredProject(activeView, store.resolveProjectId),
    [activeView, store.resolveProjectId],
  );

  const handlers = useAppHandlers({
    store,
    activeView: resolvedView,
    onOpenHome: undefined,
    onOpenDashboard: undefined,
    onOpenTicket: undefined,
    onOpenThread: (projectId, threadId) => {
      setRouteView({ type: "thread", projectId, threadId });
    },
  });

  const activeThreadId = readActiveThreadIdFromView(resolvedView);

  return (
    <div>
      <button data-testid="tick" onClick={() => setTick((t) => t + 1)}>
        {tick}
      </button>
      {store.threads.map((thread, index) => (
        <CountingRow
          key={thread.id}
          rowId={`row-${index}`}
          thread={thread}
          isSelected={activeThreadId === thread.id}
          projectId={PROJECT_ID}
          onSelectThread={handlers.handleSelectThread}
          onDeleteThread={handlers.handleDeleteThread}
          onRenameThread={store.renameThread}
        />
      ))}
    </div>
  );
}

function clickRow(container: HTMLElement, title: string): void {
  const buttons = [...container.querySelectorAll<HTMLElement>('[data-sidebar="menu-sub-button"]')];
  const target = buttons.find((button) => button.textContent?.includes(title));
  expect(target, `row "${title}" should be rendered`).toBeTruthy();
  target!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

function reRenderedRows(): string[] {
  return [...renderCounts.entries()]
    .filter(([, count]) => count > 0)
    .map(([rowId]) => rowId)
    .toSorted();
}

describe("Work-lens thread selection re-render regression (real store + handlers wiring)", () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    renderCounts.clear();
    lastStore = null;
  });

  it("keeps the store object identity stable across an unrelated re-render", async () => {
    await act(async () => {
      root.render(<Harness />);
    });
    const firstStore = lastStore;
    expect(firstStore).not.toBeNull();

    // Force a real re-render via unrelated state. The store object must keep
    // its identity. (The React Compiler already memoizes the return implicitly;
    // the explicit `useMemo` in `useProjectStore` makes this guarantee hold
    // regardless of compiler settings.)
    await act(async () => {
      const tickButton = container.querySelector<HTMLButtonElement>("[data-testid='tick']");
      expect(tickButton).not.toBeNull();
      tickButton!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    expect(lastStore).toBe(firstStore);
  });

  it("selecting a thread re-renders only the two affected rows, not the list", async () => {
    await act(async () => {
      root.render(<Harness />);
    });

    // Seed one project and 12 threads through the REAL store API.
    const store = lastStore!;
    const project = {
      id: PROJECT_ID,
      title: "Test Project",
      source: { provider: "local", raw: {} },
    } as unknown as ProjectShellProject;
    await act(async () => {
      store.addProject(project);
      for (let i = 0; i < ROW_COUNT; i += 1) {
        store.createThread(PROJECT_ID, { title: `Thread ${i}` });
      }
    });

    // Baseline selection (exercises the full real flow once, warms nothing up
    // that the second selection would not exercise).
    renderCounts.clear();
    await act(async () => {
      clickRow(container, "Thread 0");
    });
    expect(reRenderedRows()).toEqual(["row-0", "row-11"]);

    // The regression: selecting a DIFFERENT thread must re-render only the row
    // that was selected and the row that was deselected.
    renderCounts.clear();
    await act(async () => {
      clickRow(container, "Thread 1");
    });

    // Pre-fix this was ALL 12 rows (row-0..row-11): the selection changed the
    // store's `view`, which changed the `store` object identity, which changed
    // the handler identities handed to the memo barrier, so no row could bail
    // out.
    expect(reRenderedRows()).toEqual(["row-0", "row-1"]);
  });
});
