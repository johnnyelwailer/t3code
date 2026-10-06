// @vitest-environment jsdom
import { act, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

/**
 * The header's Digest | List | Board | Backlog control ↔ dashboard mode ↔ My Work lens ↔ URL. The
 * router is a tiny in-memory location: `navigate` applies the `search` updater the persisted-route
 * hook passes, exactly as TanStack Router would.
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

const { useProjectDashboardViewTab } =
  await import("~/t3team/hooks/t3team-useProjectDashboardViewTab");
const { ProjectMyWorkViewSwitch } = await import("~/t3team/t3team-ProjectMyWorkViewSwitch");

// Mirrors ProjectDashboard: one hook call feeds both the control and the rendered body.
function Harness() {
  const { mode, lens, selectLens, selectBacklog } = useProjectDashboardViewTab("p1");
  return (
    <>
      <ProjectMyWorkViewSwitch
        lens={lens}
        onLensChange={selectLens}
        backlog={{ kind: "select", active: mode === "backlog", onSelect: selectBacklog }}
      />
      <main data-body={mode === "backlog" ? "backlog" : lens} />
    </>
  );
}

let root: Root | null = null;
let container: HTMLDivElement;

const pressed = () =>
  container.querySelector('[aria-pressed="true"]')?.getAttribute("data-segment") ?? null;
const body = () => container.querySelector("main")?.dataset.body;
const click = (segment: string) =>
  act(async () =>
    container.querySelector<HTMLButtonElement>(`[data-segment="${segment}"]`)?.click(),
  );

async function render() {
  await act(async () => {
    root = createRoot(container);
    root.render(<Harness />);
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.sessionStorage.clear();
  window.localStorage.clear();
  navigate.mockClear();
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
});

describe("project dashboard view tabs", () => {
  it("opens on My work's digest and writes both URL keys", async () => {
    location = { pathname: "/t3team/projects/p1", search: {} };
    await render();
    expect(pressed()).toBe("digest");
    expect(location.search).toMatchObject({ projectView: "my-work", myWorkLens: "digest" });
  });

  it("honours an incoming ?projectView=backlog link without writing anything", async () => {
    location = { pathname: "/t3team/projects/p1", search: { projectView: "backlog", keep: "x" } };
    await render();
    expect(pressed()).toBe("backlog");
    expect(body()).toBe("backlog");
  });

  it("switches lens in place, keeping the URL contract", async () => {
    location = { pathname: "/t3team/projects/p1", search: { keep: "x" } };
    await render();
    await click("board");
    expect(pressed()).toBe("board");
    expect(body()).toBe("board");
    expect(location.search).toMatchObject({
      projectView: "my-work",
      myWorkLens: "board",
      keep: "x",
    });
  });

  it("Backlog is one segment of the same control and leaves the lens as it was", async () => {
    location = { pathname: "/t3team/projects/p1", search: {} };
    await render();
    await click("hierarchy");
    await click("backlog");
    expect(pressed()).toBe("backlog");
    expect(body()).toBe("backlog");
    expect(location.search).toMatchObject({ projectView: "backlog", myWorkLens: "hierarchy" });
  });

  it("picking a lens from the Backlog leaves the Backlog", async () => {
    location = { pathname: "/t3team/projects/p1", search: { projectView: "backlog" } };
    await render();
    await click("board");
    expect(pressed()).toBe("board");
    expect(body()).toBe("board");
    expect(location.search).toMatchObject({ projectView: "my-work", myWorkLens: "board" });
    expect(
      JSON.parse(
        window.sessionStorage.getItem("t3team:project-dashboard-mode-state:v1:p1") ?? "{}",
      ),
    ).toEqual({ dashboardMode: "my-work" });
  });
});
