/* oxlint-disable t3code/no-dom-test-environment -- The re-render gate requires this sibling name, which is not a browser test; the unit file sets jsdom. */
/* oxlint-disable t3code/require-disposable-render -- The shared render helper imports vite-plus/test/browser and can only run in Browser Mode. */
// @vitest-environment jsdom
/**
 * WelcomeRouteView holds a dismissed flag and reads the path, the hash, the
 * environment catalog, and the Nexi welcome flag. A store notify that does not
 * change those, or a hash change after setup is dismissed, must not reopen
 * setup. The render count is the budget.
 */
import { act, Suspense, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { Route } from "./welcome";
import { renderCounter } from "~/test/t3team-renderCounter";

// The route plugin code-splits the page, so the route's component is a lazy
// loader. Rendering it inside Suspense loads the real view without a named
// export on the route file, which would keep the view in the main chunk.
function isRouteView(component: unknown): component is ComponentType {
  return typeof component === "function";
}

function hasPreload(component: object): component is { preload: () => Promise<unknown> } {
  return (
    "preload" in component && typeof (component as { preload: unknown }).preload === "function"
  );
}

const welcomeComponent = Route.options.component;
if (!isRouteView(welcomeComponent)) {
  throw new Error("welcome route is missing its component");
}
if (hasPreload(welcomeComponent)) {
  await welcomeComponent.preload();
}
const WelcomeRouteView: ComponentType = welcomeComponent;

interface WelcomeStore {
  readonly pathname: string;
  readonly hash: string;
  readonly nexiWelcome: boolean;
  readonly primaryEnvironmentId: string | null;
  readonly catalogReady: boolean;
}

const hooks = vi.hoisted(() => {
  const initial = (): WelcomeStore => ({
    pathname: "/welcome",
    hash: "",
    nexiWelcome: true,
    primaryEnvironmentId: "e1",
    catalogReady: true,
  });
  let state = initial();
  const listeners = new Set<() => void>();
  const store = {
    get: () => state,
    set: (patch: Partial<WelcomeStore>) => {
      state = { ...state, ...patch };
      listeners.forEach((listener) => listener());
    },
    notify: () => {
      listeners.forEach((listener) => listener());
    },
    replace: (next: WelcomeStore) => {
      state = next;
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  const navigate = vi.fn(async () => {});
  const openNewThread = vi.fn(async () => {});
  const setupDone = { fn: async (_projectRef?: unknown) => {} };
  const count = { fn: (_id: string) => {} };
  const { useSyncExternalStore } = require("react") as typeof import("react");
  function useSelected<S>(select: (state: WelcomeStore) => S): S {
    return useSyncExternalStore(store.subscribe, () => select(store.get()));
  }
  return { store, initial, navigate, openNewThread, setupDone, count, useSelected };
});

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createFileRoute: () => (opts: { component: unknown; beforeLoad?: unknown }) => ({
      ...opts,
      options: opts,
    }),
    useNavigate: () => hooks.navigate,
    useLocation: ({
      select,
    }: {
      select: (location: { pathname: string; hash: string }) => unknown;
    }) => hooks.useSelected((state) => select({ pathname: state.pathname, hash: state.hash })),
    redirect: (options: unknown) => {
      throw options;
    },
  };
});

vi.mock("~/t3team/welcome/t3team-useNexiWelcomeEnabled", () => ({
  useNexiWelcomeEnabled: () => {
    hooks.count.fn("welcome");
    return hooks.useSelected((state) => state.nexiWelcome);
  },
}));

vi.mock("../state/environments", () => ({
  usePrimaryEnvironmentId: () => hooks.useSelected((state) => state.primaryEnvironmentId),
  useEnvironments: () => {
    const isReady = hooks.useSelected((state) => state.catalogReady);
    const primary = hooks.useSelected((state) => state.primaryEnvironmentId);
    return { isReady, environments: primary === null ? [] : [{ environmentId: primary }] };
  },
}));

vi.mock("~/hooks/useHandleNewThread", () => ({
  useNewThreadHandler: () => hooks.openNewThread,
}));

vi.mock("../components/NoProjectsHero", () => ({
  NoProjectsHero: () => {
    hooks.count.fn("hero");
    return <div data-testid="hero">hero</div>;
  },
}));

// Each setup page records its onDone so a test can finish setup the way the page would.
vi.mock("~/t3team/welcome/t3team-NexiWelcomePage", () => ({
  NexiWelcomePage: (props: { onDone: (projectRef?: unknown) => Promise<void> }) => {
    hooks.count.fn("nexi");
    hooks.setupDone.fn = props.onDone;
    return <div data-testid="nexi">nexi</div>;
  },
}));

vi.mock("../components/onboarding/WelcomePage", () => ({
  WelcomePage: (props: { onDone: (projectRef?: unknown) => Promise<void> }) => {
    hooks.count.fn("upstream");
    hooks.setupDone.fn = props.onDone;
    return <div data-testid="upstream">upstream</div>;
  },
}));

const counter = renderCounter();
hooks.count.fn = (id: string) => counter.count(id);

const shown = (container: HTMLElement) =>
  ["nexi", "upstream", "hero"].filter((id) => container.querySelector(`[data-testid='${id}']`));

async function renderWelcome(root: Root) {
  await act(async () => {
    root.render(
      <Suspense fallback={null}>
        <WelcomeRouteView />
      </Suspense>,
    );
  });
}

describe("WelcomeRouteView re-renders", () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    hooks.store.replace(hooks.initial());
    hooks.navigate.mockReset();
    hooks.openNewThread.mockReset();
    hooks.openNewThread.mockResolvedValue(undefined);
    hooks.navigate.mockResolvedValue(undefined);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    counter.reset();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("shows the Nexi welcome alone and does not re-render on a notify with the same state", async () => {
    await renderWelcome(root);
    expect(shown(container)).toEqual(["nexi"]);
    counter.expectRerendered({ welcome: 1, nexi: 1 });

    counter.reset();
    await act(async () => {
      hooks.store.notify();
    });
    counter.expectRerendered({});
  });

  it("falls back to the upstream Welcome page when the Nexi welcome flag goes off", async () => {
    await renderWelcome(root);
    counter.reset();
    await act(async () => {
      hooks.store.set({ nexiWelcome: false });
    });
    expect(shown(container)).toEqual(["upstream"]);
    counter.expectRerendered({ welcome: 1, upstream: 1 });
  });

  it("waits for the environment catalog before choosing a computer", async () => {
    hooks.store.replace({
      ...hooks.initial(),
      nexiWelcome: false,
      primaryEnvironmentId: null,
      catalogReady: false,
    });
    await renderWelcome(root);
    expect(shown(container)).toEqual([]);
    counter.reset();
    await act(async () => {
      hooks.store.set({ primaryEnvironmentId: "e1", catalogReady: true });
    });
    expect(shown(container)).toEqual(["upstream"]);
  });

  it("does not show setup when the path is no longer /welcome, even if it was not dismissed", async () => {
    await renderWelcome(root);
    counter.reset();
    await act(async () => {
      hooks.store.set({ pathname: "/" });
    });
    counter.expectRerendered({ welcome: 1, hero: 1 });
    expect(shown(container)).toEqual(["hero"]);
  });

  it("dismisses setup once, and a later hash change does not reopen it", async () => {
    await renderWelcome(root);
    counter.reset();
    await act(async () => {
      await hooks.setupDone.fn();
    });
    expect(hooks.navigate).toHaveBeenCalledWith({ to: "/", replace: true });
    expect(shown(container)).toEqual(["hero"]);
    counter.expectRerendered({ welcome: 1, hero: 1 });

    counter.reset();
    await act(async () => {
      hooks.store.set({ hash: "agents:e1" });
    });
    // The route still reads the hash, so it re-renders once, but setup stays closed.
    counter.expectRerendered({ welcome: 1 });
    expect(shown(container)).toEqual(["hero"]);
  });

  it("opens a thread when setup finishes with a project, and falls back home if that open fails", async () => {
    await renderWelcome(root);
    await act(async () => {
      await hooks.setupDone.fn({ id: "p1" });
    });
    expect(hooks.openNewThread).toHaveBeenCalledWith({ id: "p1" }, { replace: true });
    expect(hooks.navigate).not.toHaveBeenCalled();
    expect(shown(container)).toEqual(["hero"]);

    await act(async () => {
      root.unmount();
    });
    hooks.openNewThread.mockReset();
    hooks.openNewThread.mockRejectedValue(new Error("open failed"));
    hooks.store.replace(hooks.initial());
    root = createRoot(container);
    await renderWelcome(root);
    await act(async () => {
      await hooks.setupDone.fn({ id: "p2" });
    });
    expect(hooks.openNewThread).toHaveBeenCalledTimes(1);
    expect(hooks.navigate).toHaveBeenCalledWith({ to: "/", replace: true });
  });
});
