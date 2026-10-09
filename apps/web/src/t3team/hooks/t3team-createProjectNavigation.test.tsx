// @vitest-environment jsdom
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useSearch,
} from "@tanstack/react-router";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { useCreateProjectNavigation } from "./t3team-createProjectNavigation";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Navigation = ReturnType<typeof useCreateProjectNavigation>;

let root: Root | null = null;

/** A real router on a memory history, with the three places the dialog moves between. */
async function mount(initialPath: string) {
  const captured: { value: Navigation | null } = { value: null };
  function Dialog() {
    const project = useSearch({
      strict: false,
      select: (s) => (s as { project?: string }).project,
    });
    captured.value = useCreateProjectNavigation(project);
    return null;
  }
  const rootRoute = createRootRoute({ component: Outlet });
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: "/t3team", component: () => null }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/t3team/new",
      validateSearch: (s: Record<string, unknown>) =>
        typeof s.project === "string" ? { project: s.project } : {},
      component: Dialog,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/t3team/projects/$projectId",
      component: () => null,
    }),
  ]);
  const history = createMemoryHistory({ initialEntries: [initialPath] });
  const router = createRouter({ routeTree, history });
  root = createRoot(document.createElement("div"));
  await act(async () => {
    root!.render(createElement(RouterProvider, { router }));
    await router.load();
  });
  return {
    router,
    nav: () => captured.value!,
    path: () => `${router.history.location.pathname}${router.history.location.search}`,
    go: (to: string) => act(async () => void (await router.navigate({ to }))),
    settle: () => act(async () => void (await new Promise((resolve) => setTimeout(resolve, 20)))),
  };
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
});

describe("create-project navigation on a real history", () => {
  it("closes back to the entry the dialog was opened from", async () => {
    const t = await mount("/t3team");
    await t.go("/t3team/new");
    expect(t.path()).toBe("/t3team/new");

    await act(async () => t.nav().close());
    await t.settle();
    expect(t.path()).toBe("/t3team");
  });

  it("closes from the second screen straight back to where the flow began", async () => {
    const t = await mount("/t3team");
    await t.go("/t3team/new");
    await act(async () => t.nav().chooseProject({ accountId: "a", externalProjectId: "1" }));
    await t.settle();
    expect(t.path()).toBe("/t3team/new?project=a%3A%3A1");

    await act(async () => t.nav().close());
    await t.settle();
    expect(t.path()).toBe("/t3team");
  });

  it("'Change project' steps back to the project list", async () => {
    const t = await mount("/t3team");
    await t.go("/t3team/new");
    await act(async () => t.nav().chooseProject({ accountId: "a", externalProjectId: "1" }));
    await t.settle();

    await act(async () => t.nav().backToChoose());
    await t.settle();
    expect(t.path()).toBe("/t3team/new");
  });

  it("leaves no dialog entries behind once a create finishes", async () => {
    const t = await mount("/t3team");
    await t.go("/t3team/new");
    await act(async () => t.nav().chooseProject({ accountId: "a", externalProjectId: "1" }));
    await t.settle();

    await act(async () => {
      t.nav().leaveThen(
        () =>
          void t.router.navigate({
            to: "/t3team/projects/$projectId",
            params: { projectId: "p1" },
            replace: true,
          }),
      );
    });
    await t.settle();
    expect(t.path()).toBe("/t3team/projects/p1");

    // Back from the new project goes to where the user was, not to a dialog.
    await act(async () => t.router.history.back());
    await t.settle();
    expect(t.path()).toBe("/t3team");
  });

  it("with no history behind it (a deep link) closing replaces with /t3team", async () => {
    const t = await mount("/t3team/new");
    await act(async () => t.nav().close());
    await t.settle();
    expect(t.path()).toBe("/t3team");
  });

  it("runs the finish action directly when there is nothing to step out of", async () => {
    const t = await mount("/t3team/new?project=a%3A%3A1");
    let ran = false;
    await act(async () => t.nav().leaveThen(() => (ran = true)));
    expect(ran).toBe(true);
  });
});
