// @vitest-environment jsdom
import { act, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

/**
 * Tabs ↔ mode state ↔ URL agreement. The router is a tiny in-memory location: `navigate` applies
 * the `search` updater the persisted-route hook passes, exactly as TanStack Router would.
 */
type Location = { pathname: string; search: Record<string, unknown> };
let location: Location = { pathname: "/t3team/projects/p1", search: {} };
const listeners = new Set<() => void>();
const navigate = vi.fn(
  (input: { search: (previous: Record<string, unknown>) => Record<string, unknown> }) => {
    location = { ...location, search: input.search(location.search) };
    for (const listener of listeners) listener();
    return Promise.resolve();
  },
);

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  useRouterState: ({ select }: { select: (state: { location: Location }) => unknown }) =>
    useSyncExternalStore(
      (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      () => select({ location }),
    ),
}));

const { useProjectDashboardModeState } =
  await import("~/t3team/hooks/t3team-useProjectDashboardModeState");
const { ProjectDashboardModeTabs } = await import("~/t3team/t3team-ProjectDashboardModeTabs");

// Mirrors ProjectDashboard: one hook call feeds both the tabs and the rendered body.
function Harness() {
  const { state, setState } = useProjectDashboardModeState("p1");
  return (
    <>
      <ProjectDashboardModeTabs
        mode={state.dashboardMode}
        onModeChange={(dashboardMode) => setState({ dashboardMode })}
      />
      <main data-body={state.dashboardMode} />
    </>
  );
}

let root: Root | null = null;
let container: HTMLDivElement;

function selectedTab() {
  return container.querySelector('[role="tab"][aria-selected="true"]')?.getAttribute("data-mode");
}

async function render() {
  await act(async () => {
    root = createRoot(container);
    root.render(<Harness />);
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.sessionStorage.clear();
  navigate.mockClear();
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
});

describe("project dashboard mode tabs", () => {
  it("opens on My work and writes ?projectView=my-work", async () => {
    location = { pathname: "/t3team/projects/p1", search: {} };
    await render();
    expect(selectedTab()).toBe("my-work");
    expect(container.querySelector("main")?.dataset.body).toBe("my-work");
    expect(location.search.projectView).toBe("my-work");
  });

  it("honours an incoming ?projectView=backlog link (another lane navigates to it)", async () => {
    location = { pathname: "/t3team/projects/p1", search: { projectView: "backlog", keep: "x" } };
    await render();
    expect(selectedTab()).toBe("backlog");
    expect(container.querySelector("main")?.dataset.body).toBe("backlog");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("clicking a tab moves the tab, the body, the URL and the session state together", async () => {
    location = { pathname: "/t3team/projects/p1", search: { projectView: "my-work", keep: "x" } };
    await render();

    const backlogTab = container.querySelector<HTMLButtonElement>('[data-mode="backlog"]');
    await act(async () => backlogTab?.click());

    expect(selectedTab()).toBe("backlog");
    expect(container.querySelector("main")?.dataset.body).toBe("backlog");
    expect(location.search).toEqual({ projectView: "backlog", keep: "x" });
    expect(
      JSON.parse(
        window.sessionStorage.getItem("t3team:project-dashboard-mode-state:v1:p1") ?? "{}",
      ),
    ).toEqual({ dashboardMode: "backlog" });

    const myWorkTab = container.querySelector<HTMLButtonElement>('[data-mode="my-work"]');
    await act(async () => myWorkTab?.click());
    expect(selectedTab()).toBe("my-work");
    expect(location.search.projectView).toBe("my-work");
  });
});
