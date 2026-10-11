// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { SidebarProjectSnapshot } from "~/sidebarProjectGrouping";
import type { JiraCatalogProject } from "~/t3team/hooks/t3team-jiraProjectCatalog.logic";

import { T3TeamSidebarProjectScopePillsView } from "./t3team-SidebarProjectScopePills";

vi.mock("../ProjectFavicon", () => ({ ProjectFavicon: () => <span /> }));
const createProject = vi.hoisted(() => vi.fn());
vi.mock("~/t3team/t3team-createProjectRequest", () => ({
  requestT3TeamCreateProject: createProject,
}));

const group = (projectKey: string) =>
  ({ projectKey, displayName: projectKey }) as unknown as SidebarProjectSnapshot;
const groups = ["alpha", "bravo", "charlie"].map(group);
const jira: JiraCatalogProject = {
  entryKey: "acc::1",
  accountId: "acc",
  provider: "atlassian",
  externalProjectId: "1",
  key: "DEL",
  title: "Delta board",
  iconUrl: undefined,
  siteHost: "s.net",
};

/** Row width for `capacity` slots after "All" (see projectScopeDiscCapacity). */
const widthFor = (capacity: number) => 28 + 124 + 20 * capacity;

let root: Root | null = null;
let container: HTMLDivElement;
let rowWidth = 0;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  class ResizeObserver {
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe() {
      this.callback(
        [{ contentRect: { width: rowWidth } } as ResizeObserverEntry],
        this as unknown as globalThis.ResizeObserver,
      );
    }
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserver);
  // jsdom has no Web Animations; Base UI's popup and scroll area ask for running animations.
  Element.prototype.getAnimations ??= () => [];
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  vi.unstubAllGlobals();
});

async function renderRow(
  capacity: number,
  onSelectScope = vi.fn(),
  addable = [jira],
  extra: { activeScopeKey?: string; onProjectContextMenu?: () => void } = {},
) {
  rowWidth = widthFor(capacity);
  await act(async () => {
    root = createRoot(container);
    root.render(
      <T3TeamSidebarProjectScopePillsView
        groups={groups}
        addable={addable}
        activeScopeKey={extra.activeScopeKey ?? null}
        onSelectScope={onSelectScope}
        onProjectContextMenu={extra.onProjectContextMenu}
      />,
    );
  });
  return onSelectScope;
}

const picker = () => container.querySelector<HTMLButtonElement>('[aria-label*="earch projects"]');
const searchInput = () =>
  document.querySelector<HTMLInputElement>('input[aria-label="Search projects"]');
const option = (label: string) =>
  [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
    (candidate) => candidate.querySelector("span.truncate")?.textContent === label,
  );
const optionLabels = () =>
  [...document.querySelectorAll('[role="option"] span.truncate')].map((label) => label.textContent);

async function openAndType(query: string) {
  await act(async () => picker()?.click());
  expect(picker()?.getAttribute("aria-expanded")).toBe("true");
  const input = document.querySelector<HTMLInputElement>('input[aria-label="Search projects"]');
  expect(input).not.toBeNull();
  if (!query) return;
  await act(async () => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setValue?.call(input, query);
    input?.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("project scope picker disc", () => {
  it("is a search disc when every project fits", async () => {
    await renderRow(5, vi.fn(), []);
    expect(picker()?.getAttribute("aria-label")).toBe("Search projects");
    expect(picker()?.textContent).toBe("");
  });

  it("counts the overflow when projects do not fit", async () => {
    await renderRow(2);
    expect(picker()?.getAttribute("aria-label")).toBe("3 more projects, search projects");
    expect(picker()?.textContent).toBe("+3");
  });

  it("lists the overflow first, then the shown discs, then All", async () => {
    await renderRow(2);
    await openAndType("");
    expect(optionLabels()).toEqual(["bravo", "charlie", "Delta board", "alpha", "All projects"]);
  });

  it("searches shown and overflow projects alike", async () => {
    await renderRow(2);
    await openAndType("ha");
    // "charlie" overflows, "alpha" is a shown disc; "All" drops out while filtering.
    expect(optionLabels()).toEqual(["charlie", "alpha"]);
  });

  it("finds Jira projects the app does not have yet", async () => {
    await renderRow(2);
    await openAndType("delta");
    expect(optionLabels()).toEqual(["Delta board"]);
  });

  it("scopes to the picked project", async () => {
    const onSelectScope = await renderRow(5, vi.fn(), []);
    await openAndType("char");
    expect(optionLabels()).toEqual(["charlie"]);
    const option = document.querySelector<HTMLElement>('[role="option"]');
    await act(async () => option?.click());
    expect(onSelectScope).toHaveBeenCalledExactlyOnceWith("charlie");
  });

  it("adds a Jira project instead of scoping, and closes", async () => {
    createProject.mockClear();
    const onSelectScope = await renderRow(2);
    await openAndType("delta");
    await act(async () => option("Delta board")?.click());
    expect(createProject).toHaveBeenCalledExactlyOnceWith({
      accountId: "acc",
      externalProjectId: "1",
    });
    expect(onSelectScope).not.toHaveBeenCalled();
    expect(picker()?.getAttribute("aria-expanded")).toBe("false");
  });

  it("marks the active scope and clears it through All projects", async () => {
    const onSelectScope = await renderRow(5, vi.fn(), [], { activeScopeKey: "bravo" });
    await openAndType("");
    expect(option("bravo")?.getAttribute("aria-selected")).toBe("true");
    await act(async () => option("All projects")?.click());
    expect(onSelectScope).toHaveBeenCalledExactlyOnceWith(null);
  });

  it("closes on Escape and forgets the query", async () => {
    await renderRow(2);
    await openAndType("char");
    await act(async () => {
      searchInput()?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(picker()?.getAttribute("aria-expanded")).toBe("false");
    await openAndType("");
    expect(searchInput()?.value).toBe("");
  });

  it("opens project settings from a row's context menu", async () => {
    const onProjectContextMenu = vi.fn();
    await renderRow(2, vi.fn(), [], { onProjectContextMenu });
    await openAndType("");
    await act(async () => {
      option("charlie")?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });
    expect(onProjectContextMenu).toHaveBeenCalledOnce();
    expect(onProjectContextMenu.mock.calls[0]?.[1]).toMatchObject({ projectKey: "charlie" });
    expect(picker()?.getAttribute("aria-expanded")).toBe("false");
  });
});
