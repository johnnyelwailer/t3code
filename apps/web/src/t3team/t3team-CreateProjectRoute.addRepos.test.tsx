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

import type { LinkedRepositorySyncResult } from "~/t3team/backend/t3team-types";
import type { JiraCatalogProject } from "~/t3team/hooks/t3team-jiraProjectCatalog.logic";
import type { JiraCatalogSiteFailure } from "~/t3team/hooks/t3team-jiraProjectCatalog.logic";

const FOUR = [
  "https://github.com/hive/MILO5",
  "https://github.com/hive/milo5-agentic",
  "https://github.com/hive/milo5-mocks",
  "https://github.com/hive/milo5-ops",
] as const;

const TWELVE = Array.from(
  { length: 12 },
  (_, index) => `https://github.com/hive/repo-${String(index + 1).padStart(2, "0")}`,
);

const RECORD = {
  id: "p-milo5",
  title: "MILO5",
  workspace: { rootPath: "/tmp/milo5" },
};

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
  urls: [] as ReadonlyArray<string>,
  byUrl: new Map<string, LinkedRepositorySyncResult>(),
  discoveryRenders: 0,
  renderCount: 0,
  created: [] as Array<{ id: string }>,
  finishCreate: undefined as undefined | ((project: unknown) => void),
  failCreate: undefined as undefined | ((error: unknown) => void),
}));

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

vi.mock("~/t3team/backend/t3team-index", () => ({
  useBackend: () => ({}),
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

vi.mock("~/t3team/hooks/t3team-useLinkedRepositorySyncStatus", () => ({
  useLinkedRepositorySyncStatus: () => ({
    byUrl: live.byUrl,
    refresh: () => {},
    syncNow: async () => {},
  }),
}));

vi.mock("~/t3team/hooks/t3team-useGitHubRepositoryDiscovery", () => ({
  useGitHubRepositoryDiscovery: () => {
    live.discoveryRenders += 1;
    return {
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
    };
  },
}));

import { CreateProjectRoute } from "~/t3team/t3team-CreateProjectRoute";
import { parseT3TeamRouteSearch } from "~/t3team/t3team-routeState";

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

const RENDER_CAP = 80;

let root: Root | null = null;
let host: HTMLElement | null = null;

function seededLive(urls: ReadonlyArray<string> = FOUR) {
  live.catalog = [AVAILABLE];
  live.loading = false;
  live.connected = true;
  live.error = null;
  live.siteFailures = [];
  live.projects = [];
  live.urls = urls;
  live.byUrl = new Map();
  live.discoveryRenders = 0;
  live.renderCount = 0;
  live.created = [];
  live.finishCreate = undefined;
  live.failCreate = undefined;
  mockCreate.mockReset();
  mockCreate.mockImplementation(async (input: { onRecordCreated?: (project: unknown) => void }) => {
    input.onRecordCreated?.(RECORD);
    return new Promise((resolve, reject) => {
      live.finishCreate = resolve;
      live.failCreate = reject;
    });
  });
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
    showCreate
      ? createElement(CreateProjectRoute, {
          onCreated: (project) => {
            live.created.push(project);
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

function page() {
  return document.querySelector('[data-testid="create-project-page"]');
}

function progress() {
  return document.querySelector('[data-testid="create-project-progress"]');
}

function buttonByText(text: string) {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
    button.textContent?.includes(text),
  );
}

async function clickAdd(t: { settle: () => Promise<void> }) {
  const add = buttonByText("Add project");
  if (!add) throw new Error("Add project button not found");
  await act(async () => {
    add.click();
  });
  await t.settle();
  // Flush onRecordCreated's setState (the record appears mid-create).
  await t.settle();
}

beforeEach(() => seededLive());

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("Add a project with linked repositories", () => {
  it("unmounts the picker on Add, shows four repos, and does not loop", async () => {
    const t = await mount("/t3team/new?project=site-ex%3A%3A10002");
    expect(page()).not.toBeNull();
    expect(buttonByText("Add project")).not.toBeUndefined();
    expect(buttonByText("Adding…")).toBeUndefined();
    const discoveryBefore = live.discoveryRenders;
    expect(discoveryBefore).toBeGreaterThan(0);

    const before = t.renders();
    await clickAdd(t);

    expect(progress()).not.toBeNull();
    expect(buttonByText("Add project")).toBeUndefined();
    expect(buttonByText("Adding…")).toBeUndefined();
    expect(progress()?.textContent).toContain("MILO5");
    expect(progress()?.textContent).toContain("milo5-agentic");
    expect(progress()?.textContent).toContain("milo5-mocks");
    expect(progress()?.textContent).toContain("milo5-ops");
    expect(buttonByText("Continue in background")).not.toBeUndefined();
    expect(mockCreate).toHaveBeenCalledTimes(1);
    // The picker (and its discovery hooks) unmounted; further ticks must not retrigger them.
    const discoveryAfterAdd = live.discoveryRenders;
    await t.settle();
    await t.settle();
    expect(live.discoveryRenders).toBe(discoveryAfterAdd);
    expect(t.renders()).toBeLessThan(RENDER_CAP);
    expect(t.renders() - before).toBeLessThan(20);
    // The create is still running — clones have not finished.
    expect(live.created).toEqual([]);
  });

  it("lists ten or more linked repositories and stays within the render budget", async () => {
    seededLive(TWELVE);
    live.byUrl = new Map(
      TWELVE.map((url) => [
        url,
        {
          url,
          localPath: `/tmp/${url.split("/").pop()}`,
          status: "pending" as const,
          syncState: "queued" as const,
        },
      ]),
    );
    const t = await mount("/t3team/new?project=site-ex%3A%3A10002");
    await clickAdd(t);
    expect(progress()).not.toBeNull();
    for (const url of TWELVE) {
      expect(progress()?.textContent).toContain(url.split("/").pop());
    }
    const mid = t.renders();
    await t.settle();
    await t.settle();
    expect(t.renders() - mid).toBeLessThan(6);
    expect(t.renders()).toBeLessThan(RENDER_CAP);
  });

  it("shows a slow clone in progress and lets the user continue in the background", async () => {
    live.byUrl = new Map(
      FOUR.map((url, index) => [
        url,
        {
          url,
          localPath: `/tmp/${url.split("/").pop()}`,
          status: "pending" as const,
          syncState: index === 0 ? ("cloning" as const) : ("queued" as const),
        },
      ]),
    );
    const t = await mount("/t3team/new?project=site-ex%3A%3A10002");
    await clickAdd(t);
    expect(progress()?.textContent).toContain("Cloning — a large repository takes a while");
    expect(live.created).toEqual([]);
    await act(async () => {
      buttonByText("Continue in background")!.click();
    });
    await t.settle();
    // Left without waiting for finalize; the create promise is still outstanding.
    expect(live.created).toEqual([RECORD]);
    expect(live.finishCreate).toBeDefined();
  });

  it("on a failed create, offers Try again and a retry starts a new create", async () => {
    const t = await mount("/t3team/new?project=site-ex%3A%3A10002");
    await clickAdd(t);
    expect(progress()).not.toBeNull();
    await act(async () => {
      live.failCreate?.(new Error("clone failed"));
      await Promise.resolve();
    });
    await t.settle();
    // The set-up screen comes back with the existing Try again footer.
    expect(progress()).toBeNull();
    expect(buttonByText("Try again")).not.toBeUndefined();
    expect(page()?.textContent).toMatch(/Couldn't add|clone failed|adding MILO5/i);
    await act(async () => {
      buttonByText("Try again")!.click();
    });
    await t.settle();
    await t.settle();
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(progress()).not.toBeNull();
    expect(t.renders()).toBeLessThan(RENDER_CAP);
  });

  it("staying mounted after Add still bounds renders (no discovery loop)", async () => {
    const t = await mount("/t3team/new?project=site-ex%3A%3A10002", true);
    await clickAdd(t);
    expect(progress()).not.toBeNull();
    const mid = t.renders();
    const discoveryMid = live.discoveryRenders;
    await t.settle();
    await t.settle();
    await t.settle();
    expect(t.renders() - mid).toBeLessThan(6);
    expect(live.discoveryRenders).toBe(discoveryMid);
    expect(t.renders()).toBeLessThan(RENDER_CAP);
  });
});
