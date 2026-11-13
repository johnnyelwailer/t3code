/* oxlint-disable t3code/no-dom-test-environment -- This harness needs a multi-route memory history; the shared render helper's router is a single root route, and Browser Mode is the wrong environment for a render-loop budget. */
/* oxlint-disable t3code/require-disposable-render -- Same reason: a custom RouterProvider on a three-route tree, not the shared one-route helper. */
// @vitest-environment jsdom
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useNavigate,
  useParams,
  useRouterState,
} from "@tanstack/react-router";
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { JiraCatalogProject } from "~/t3team/hooks/t3team-jiraProjectCatalog.logic";
import {
  FOUR_REPOS,
  LIVE_SHAPED_DISCOVERY,
  RENDER_CAP,
  bumpRenderCount,
} from "~/t3team/test/t3team-liveShapedSurface";
import { parseT3TeamRouteSearch } from "~/t3team/t3team-routeState";

void LIVE_SHAPED_DISCOVERY;

const RECORD = {
  id: "p-milo5",
  title: "MILO5",
  workspace: { rootPath: "/tmp/milo5" },
};

const live = vi.hoisted(() => {
  const bag = {
    catalog: [] as JiraCatalogProject[],
    loading: false,
    connected: true as boolean | null,
    error: null as unknown,
    siteFailures: [] as unknown[],
    projects: [] as Array<{
      id: string;
      source?: { provider: "atlassian"; accountId: string; externalProjectId: string };
      workspace?: { rootPath?: string } | null;
    }>,
    urls: [] as ReadonlyArray<string>,
    renderCount: 0,
    runnerCalls: 0,
    inboxCalls: 0,
    created: [] as Array<{ id: string }>,
    backend: null as unknown,
  };
  bag.backend = {
    github: {
      discoverInbox: async () => {
        bag.inboxCalls += 1;
        return {
          host: "github.com",
          account: "yg",
          suggestedRepositoryUrls: [...bag.urls],
          repositories: bag.urls.map((url) => ({
            id: url,
            nameWithOwner: url.replace("https://github.com/", ""),
            url,
            host: "github.com",
          })),
        };
      },
    },
    projectWorkspace: {
      readLinkedRepositoryStatus: async () => ({ linkedRepositories: [] }),
      syncLinkedRepository: async () => {},
    },
  };
  return bag;
});

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

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

vi.mock("~/state/environments", () => ({
  usePrimaryEnvironmentId: () => "env-1",
}));

vi.mock("~/state/sourceControl", () => ({
  sourceControlEnvironment: { discovery: {} },
}));

vi.mock("~/hooks/useLiveRefresh", () => ({
  useLiveRefresh: () => {},
}));

vi.mock("~/t3team/hooks/t3team-useRepositoryListFollowUp", () => ({
  useRepositoryListFollowUp: () => {},
}));

vi.mock("~/state/use-atom-query-runner", async () => {
  const { AsyncResult } = await import("effect/reactivity");
  return {
    useAtomQueryRunner: () => async () => {
      live.runnerCalls += 1;
      return AsyncResult.success({
        sourceControlProviders: [
          {
            kind: "github",
            auth: {
              status: "authenticated" as const,
              host: "github.com",
              account: "yg",
              accounts: [
                { host: "github.com", account: "yg", active: true, authenticated: true },
              ],
            },
          },
        ],
      });
    },
  };
});

vi.mock("~/t3team/backend/t3team-index", () => ({
  useBackend: () => live.backend,
}));

vi.mock("~/t3team/hooks/t3team-createJiraProject", () => ({
  createJiraProject: (input: { onRecordCreated?: (project: unknown) => void }) => mockCreate(input),
}));

vi.mock("~/t3team/hooks/t3team-useLinkedRepositorySelection", () => ({
  useLinkedRepositorySelection: () => ({
    linkedRepositoryUrls: live.urls,
    toggleRepository: () => {},
    linkRepositories: () => {},
  }),
}));

import { CreateProjectRoute } from "~/t3team/t3team-CreateProjectRoute";
import { OpenExistingProjectRedirect } from "~/t3team/t3team-OpenExistingProjectRedirect";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const AVAILABLE: JiraCatalogProject = {
  entryKey: "site-ex::10002",
  accountId: "site-ex",
  provider: "atlassian",
  externalProjectId: "10002",
  key: "MILO5",
  title: "MILO5",
  iconUrl: undefined,
  siteHost: "example.atlassian.net",
};

let root: Root | null = null;
let host: HTMLElement | null = null;

function seededLive(urls: ReadonlyArray<string> = FOUR_REPOS) {
  live.catalog = [AVAILABLE];
  live.loading = false;
  live.connected = true;
  live.error = null;
  live.siteFailures = [];
  live.projects = [];
  live.urls = urls;
  live.renderCount = 0;
  live.runnerCalls = 0;
  live.inboxCalls = 0;
  live.created = [];
  mockCreate.mockReset();
  mockCreate.mockImplementation(async (input: { onRecordCreated?: (project: unknown) => void }) => {
    input.onRecordCreated?.(RECORD);
    return RECORD;
  });
}

function Surface({ stayMounted = false }: { stayMounted?: boolean }) {
  bumpRenderCount(live, "CreateProjectRoute");
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const params = useParams({ strict: false }) as { projectId?: string };
  const navigate = useNavigate();
  const showCreate = stayMounted || pathname === "/t3team/new";
  return createElement(
    "div",
    null,
    showCreate
      ? createElement(CreateProjectRoute, {
          onCreated: (project) => {
            live.created.push(project);
            void navigate({
              to: "/t3team/projects/$projectId",
              params: { projectId: project.id },
              replace: true,
            });
          },
        })
      : null,
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

function buttonByText(text: string) {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
    button.textContent?.includes(text),
  );
}

beforeEach(() => seededLive());

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("CreateProjectRoute loop guard (live-shaped discovery and auth)", () => {
  it("the catalog lists projects and stays under the render cap", async () => {
    const t = await mount("/t3team/new");
    for (let i = 0; i < 6; i += 1) await t.settle();
    expect(host!.textContent).toContain("MILO5");
    expect(t.renders()).toBeLessThan(RENDER_CAP);
    expect(live.runnerCalls).toBeLessThan(15);
  });

  it("Add with four repos opens the project immediately, probes a bounded number of times, and does not loop", async () => {
    const t = await mount("/t3team/new?project=site-ex%3A%3A10002");
    for (let i = 0; i < 6; i += 1) await t.settle();
    expect(live.runnerCalls).toBeGreaterThanOrEqual(1);
    expect(live.runnerCalls).toBeLessThan(15);
    const add = buttonByText("Add project");
    if (!add) {
      throw new Error(`Add project button not found. Body: ${host!.textContent?.slice(0, 500)}`);
    }
    await act(async () => {
      add!.click();
    });
    await t.settle();
    await t.settle();
    expect(live.created.length).toBeGreaterThanOrEqual(1);
    expect(live.created.every((project) => project.id === "p-milo5")).toBe(true);
    expect(t.path()).toBe("/t3team/projects/p-milo5");
    expect(t.renders()).toBeLessThan(RENDER_CAP);
    expect(host!.textContent).not.toMatch(/Continue in background/i);
  });
});

describe("OpenExistingProjectRedirect loop guard", () => {
  it("opens once with a live-shaped callback and does not loop", async () => {
    const opens: string[] = [];
    const bag = { renderCount: 0 };
    function RedirectHost() {
      bumpRenderCount(bag, "OpenExistingProjectRedirect");
      const [, setTick] = useState(0);
      // New identity every render; the redirect must not list `open` in effect deps.
      const open = (projectId: string) => {
        opens.push(projectId);
        if (opens.length === 1) setTick((n) => n + 1);
      };
      return createElement(OpenExistingProjectRedirect, { projectId: "app-ex-one", open });
    }
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(createElement(RedirectHost));
    });
    for (let i = 0; i < 6; i += 1) {
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
    }
    expect(opens).toEqual(["app-ex-one"]);
    expect(bag.renderCount).toBeLessThan(RENDER_CAP);
    expect(bag.renderCount).toBeLessThan(12);
    expect(host!.textContent).toContain("Opening");
  });
});
