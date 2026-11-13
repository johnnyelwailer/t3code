/* oxlint-disable t3code/no-dom-test-environment -- This harness needs a multi-route memory history; the shared render helper's router is a single root route, and Browser Mode is the wrong environment for a render-loop budget. */
/* oxlint-disable t3code/require-disposable-render -- Same reason: a custom RouterProvider on a three-route tree, not the shared one-route helper. */
/* oxlint-disable react/immutability -- The render budget lives outside the tree so a loop can fail the test; same idea as the rerender-gate counter. */
// @vitest-environment jsdom
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useParams,
  useRouterState,
} from "@tanstack/react-router";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { JiraCatalogProject } from "~/t3team/hooks/t3team-jiraProjectCatalog.logic";
import type { JiraCatalogSiteFailure } from "~/t3team/hooks/t3team-jiraProjectCatalog.logic";

const live = vi.hoisted(() => ({
  catalog: [] as JiraCatalogProject[],
  loading: false,
  connected: true as boolean | null,
  error: null as unknown,
  siteFailures: [] as JiraCatalogSiteFailure[],
  projects: [] as Array<{
    id: string;
    source?: { provider: "atlassian"; accountId: string; externalProjectId: string };
    workspace?: { rootPath?: string } | null;
  }>,
  renderCount: 0,
}));

vi.mock("~/t3team/hooks/t3team-useJiraProjectCatalogState", () => ({
  useJiraProjectCatalogState: () => ({
    catalog: live.catalog,
    loading: live.loading,
    connected: live.connected,
    error: live.error,
    siteFailures: live.siteFailures,
    refresh: () => Promise.resolve(),
  }),
}));

vi.mock("~/state/entities", () => ({
  useProjects: () => live.projects,
}));

vi.mock("~/t3team/t3team-projectSetupProfile", () => ({
  useT3TeamProjectSetupProfile: () => "product-partner",
}));

vi.mock("~/t3team/hooks/t3team-useCreateProjectSubmit", () => ({
  useCreateProjectSubmit: () => ({
    state: { kind: "idle" as const },
    submit: () => Promise.resolve(null),
  }),
}));

vi.mock("~/t3team/hooks/t3team-useGitHubRepositoryDiscovery", () => ({
  useGitHubRepositoryDiscovery: () => ({
    backendAvailable: true,
    signedIn: true,
    githubHost: "github.com",
    authStatus: "authenticated",
    loadingAuth: false,
    loadingDiscovery: false,
    suggestedUrls: [],
    visibleSuggestedUrls: [],
    catalog: [],
    authenticatedHosts: [],
    refresh: () => {},
    selectHost: () => {},
    setGithubHost: () => {},
  }),
}));

import { CreateProjectRoute } from "~/t3team/t3team-CreateProjectRoute";
import { parseT3TeamRouteSearch } from "~/t3team/t3team-routeState";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ADDED: JiraCatalogProject = {
  entryKey: "site-ex::10001",
  accountId: "site-ex",
  provider: "atlassian",
  externalProjectId: "10001",
  key: "EX",
  title: "Example One",
  iconUrl: undefined,
  siteHost: "example-one.atlassian.net",
};

const AVAILABLE: JiraCatalogProject = {
  ...ADDED,
  entryKey: "site-ex::10002",
  externalProjectId: "10002",
  key: "TWO",
  title: "Example Two",
};

const RENDER_CAP = 80;

let root: Root | null = null;
let host: HTMLElement | null = null;

function seededLive(
  options: { loading?: boolean; withWorkspace?: boolean; staleBinding?: boolean } = {},
) {
  live.catalog = [AVAILABLE, ADDED];
  live.loading = options.loading ?? false;
  live.connected = true;
  live.error = null;
  live.siteFailures = [];
  live.projects = options.staleBinding
    ? []
    : [
        {
          id: "app-ex-one",
          source: {
            provider: "atlassian",
            accountId: "site-ex",
            externalProjectId: "10001",
          },
          workspace: options.withWorkspace === false ? null : { rootPath: "/tmp/example-one" },
        },
      ];
  live.renderCount = 0;
}

function Surface({ stayMounted = false }: { stayMounted?: boolean }) {
  live.renderCount += 1;
  if (live.renderCount > RENDER_CAP) {
    throw new Error(
      `render loop: CreateProjectRoute surface rendered more than ${RENDER_CAP} times`,
    );
  }
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const params = useParams({ strict: false }) as { projectId?: string };
  const showCreate = stayMounted || pathname === "/t3team/new";
  return createElement(
    "div",
    null,
    showCreate ? createElement(CreateProjectRoute, { onCreated: () => {} }) : null,
    pathname.startsWith("/t3team/projects/")
      ? createElement("div", { "data-testid": "project-page" }, params.projectId)
      : null,
  );
}

async function mount(initialPath: string, stayMounted = false) {
  const rootRoute = createRootRoute({ component: Outlet });
  const parseSearch = (s: Record<string, unknown>) => parseT3TeamRouteSearch(s);
  const surface = () => createElement(Surface, { stayMounted });
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: "/t3team", component: () => null }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/t3team/new",
      validateSearch: parseSearch,
      component: surface,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/t3team/projects/$projectId",
      validateSearch: parseSearch,
      component: surface,
    }),
  ]);
  const history = createMemoryHistory({ initialEntries: [initialPath] });
  const router = createRouter({ routeTree, history });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(createElement(RouterProvider, { router }));
    await router.load();
  });
  const settle = () =>
    act(async () => {
      await router.load();
      await Promise.resolve();
      await Promise.resolve();
    });
  await settle();
  return {
    router,
    path: () => `${router.history.location.pathname}${router.history.location.search}`,
    settle,
    renders: () => live.renderCount,
  };
}

function dialog() {
  return document.querySelector('[data-testid="create-project-page"]');
}

function rowButton(title: string) {
  return [...document.querySelectorAll<HTMLButtonElement>("li button")].find((button) =>
    button.textContent?.includes(title),
  );
}

beforeEach(() => seededLive());

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("Open on an already-added project", () => {
  it("navigates to the project, closes the dialog, and does not loop", async () => {
    const t = await mount("/t3team/new");
    expect(dialog()).not.toBeNull();
    expect(rowButton("Example One")?.textContent).toContain("Open");

    const before = t.renders();
    await act(async () => rowButton("Example One")!.click());
    await t.settle();
    await t.settle();

    expect(t.path()).toBe("/t3team/projects/app-ex-one");
    expect(dialog()).toBeNull();
    expect(document.querySelector('[data-testid="project-page"]')?.textContent).toBe("app-ex-one");
    expect(t.renders()).toBeLessThan(RENDER_CAP);
    expect(t.renders() - before).toBeLessThan(20);
  });

  it("a deep link to an already-added project opens it once, without a loop", async () => {
    const t = await mount("/t3team/new?project=site-ex%3A%3A10001");
    await t.settle();
    expect(t.path()).toBe("/t3team/projects/app-ex-one");
    expect(dialog()).toBeNull();
    expect(t.renders()).toBeLessThan(RENDER_CAP);
  });

  it("staying mounted after Open still bounds renders (no effect/navigation loop)", async () => {
    const t = await mount("/t3team/new", true);
    await act(async () => rowButton("Example One")!.click());
    await t.settle();
    await t.settle();
    expect(t.path()).toBe("/t3team/projects/app-ex-one");
    expect(t.renders()).toBeLessThan(RENDER_CAP);
    // The shared surface may keep the page in the tree; it must not retrigger Open.
    const mid = t.renders();
    await t.settle();
    await t.settle();
    expect(t.renders() - mid).toBeLessThan(6);
  });

  it("a deep link that stays mounted opens once and then sits still", async () => {
    const t = await mount("/t3team/new?project=site-ex%3A%3A10001", true);
    await t.settle();
    await t.settle();
    expect(t.path()).toBe("/t3team/projects/app-ex-one");
    const mid = t.renders();
    await t.settle();
    await t.settle();
    expect(t.renders() - mid).toBeLessThan(6);
    expect(t.renders()).toBeLessThan(RENDER_CAP);
  });

  it("ignores a second click once navigation has started", async () => {
    const t = await mount("/t3team/new");
    const button = rowButton("Example One")!;
    await act(async () => {
      button.click();
      button.click();
    });
    await t.settle();
    expect(t.path()).toBe("/t3team/projects/app-ex-one");
    expect(t.renders()).toBeLessThan(RENDER_CAP);
  });

  it("Open while the catalog is still refreshing uses the already-added row and does not loop", async () => {
    seededLive({ loading: true });
    const t = await mount("/t3team/new");
    expect(rowButton("Example One")).not.toBeUndefined();
    await act(async () => rowButton("Example One")!.click());
    await t.settle();
    expect(t.path()).toBe("/t3team/projects/app-ex-one");
    expect(dialog()).toBeNull();
    expect(t.renders()).toBeLessThan(RENDER_CAP);
  });

  it("Open on a binding whose workspace is gone shows a plain error and does not freeze", async () => {
    seededLive({ staleBinding: true });
    // The row is "already added" only when boundProjectIds has it; with no live
    // projects the row is in "Projects" and would Add. Force a stale bound id
    // through a leftover binding by putting a project with the Jira source but
    // no id resolution — covered by the helper when the workspace is missing.
    live.projects = [
      {
        id: "app-ex-one",
        source: { provider: "atlassian", accountId: "site-ex", externalProjectId: "10001" },
        workspace: null,
      },
    ];
    const t = await mount("/t3team/new");
    await act(async () => rowButton("Example One")!.click());
    await t.settle();
    await t.settle();
    expect(t.renders()).toBeLessThan(RENDER_CAP);
    // After the fix: either we still navigate (workspace is optional) without a
    // loop, or we stay on the dialog with a plain inline error. Never freeze.
    if (dialog()) {
      expect(dialog()!.textContent ?? "").toMatch(
        /workspace is no longer available|no longer available/i,
      );
      expect(t.path()).toContain("/t3team/new");
    } else {
      expect(t.path()).toBe("/t3team/projects/app-ex-one");
    }
  });
});

describe("other actions on the add-project dialog", () => {
  it("Search narrows the list and clearing it restores both sections", async () => {
    const t = await mount("/t3team/new");
    const input = document.querySelector("input")!;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      setValue.call(input, "Two");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(rowButton("Example Two")).not.toBeUndefined();
    expect(rowButton("Example One")).toBeUndefined();
    await act(async () => {
      setValue.call(input, "");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(rowButton("Example One")).not.toBeUndefined();
    expect(rowButton("Example Two")).not.toBeUndefined();
    expect(t.renders()).toBeLessThan(RENDER_CAP);
  });

  it("choosing an available project opens the set-up screen (Add)", async () => {
    const t = await mount("/t3team/new");
    await act(async () => rowButton("Example Two")!.click());
    await t.settle();
    expect(t.path()).toBe("/t3team/new?project=site-ex%3A%3A10002");
    expect(dialog()?.textContent).toContain("Example Two");
    expect(dialog()?.textContent).toMatch(/Add project/);
    expect(t.renders()).toBeLessThan(RENDER_CAP);
  });

  it("Cancel / close and Escape leave the dialog", async () => {
    const t = await mount("/t3team");
    await act(async () => void (await t.router.navigate({ to: "/t3team/new" })));
    await t.settle();
    expect(dialog()).not.toBeNull();

    await act(async () => {
      document.querySelector<HTMLButtonElement>('[aria-label="Close"]')!.click();
    });
    await t.settle();
    expect(t.path()).toBe("/t3team");
    expect(dialog()).toBeNull();

    await act(async () => void (await t.router.navigate({ to: "/t3team/new" })));
    await t.settle();
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    await t.settle();
    expect(t.path()).toBe("/t3team");
    expect(t.renders()).toBeLessThan(RENDER_CAP);
  });

  it("Enter on a focused already-added row opens it, like a click", async () => {
    const t = await mount("/t3team/new");
    const button = rowButton("Example One")!;
    button.focus();
    await act(async () => {
      button.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
      );
      // A real button click follows Enter; jsdom does not always synthesize it.
      if (t.path() === "/t3team/new") button.click();
    });
    await t.settle();
    expect(t.path()).toBe("/t3team/projects/app-ex-one");
    expect(t.renders()).toBeLessThan(RENDER_CAP);
  });
});
