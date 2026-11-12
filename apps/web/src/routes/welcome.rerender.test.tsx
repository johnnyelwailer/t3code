/* oxlint-disable t3code/no-dom-test-environment -- The re-render gate requires this sibling name, which is not a browser test; the unit file sets jsdom. */
/* oxlint-disable t3code/require-disposable-render -- The shared render helper imports vite-plus/test/browser and can only run in Browser Mode. */
// @vitest-environment jsdom
/**
 * WelcomeRouteView holds a dismissed flag and reads the path, the hash, and
 * the Nexi welcome flag. A store notify that does not change those, or a
 * hash change after the wizard is dismissed, must not reopen setup. The
 * render count is the budget.
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
  readonly authStatus: "authenticated" | "hosted-static";
}

const hooks = vi.hoisted(() => {
  const initial = (): WelcomeStore => ({
    pathname: "/welcome",
    hash: "",
    nexiWelcome: false,
    authStatus: "authenticated",
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
  const wizardDone = { fn: async (_projectRef?: unknown) => {} };
  const count = { fn: (_id: string) => {} };
  const { useSyncExternalStore } = require("react") as typeof import("react");
  function useSelected<S>(select: (state: WelcomeStore) => S): S {
    return useSyncExternalStore(store.subscribe, () => select(store.get()));
  }
  return { store, initial, navigate, openNewThread, wizardDone, count, useSelected };
});

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createFileRoute: () => (opts: { component: unknown; beforeLoad?: unknown }) => ({
      ...opts,
      options: opts,
      useRouteContext: () => ({
        authGateState: { status: hooks.store.get().authStatus },
      }),
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

vi.mock("~/hooks/useHandleNewThread", () => ({
  useNewThreadHandler: () => hooks.openNewThread,
}));

vi.mock("../components/NoProjectsHero", () => ({
  NoProjectsHero: () => {
    hooks.count.fn("hero");
    return <div data-testid="hero">hero</div>;
  },
}));

vi.mock("../components/onboarding/WelcomeWizard", () => ({
  WelcomeWizard: (props: {
    localAvailable: boolean;
    resumeEnvironmentId: unknown;
    onDone: (projectRef?: unknown) => Promise<void>;
  }) => {
    hooks.count.fn("wizard");
    hooks.wizardDone.fn = props.onDone;
    return (
      <div data-testid="wizard">
        <span data-testid="wizard-local">{props.localAvailable ? "local" : "hosted"}</span>
        <button type="button" onClick={() => void props.onDone()}>
          done
        </button>
        <button type="button" onClick={() => void props.onDone({ id: "p1" })}>
          done-project
        </button>
      </div>
    );
  },
}));

const counter = renderCounter();
hooks.count.fn = (id: string) => counter.count(id);

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

  it("does not re-render when a location notify carries the same path and hash", async () => {
    await renderWelcome(root);
    expect(container.querySelector("[data-testid='wizard']")).not.toBeNull();
    expect(container.querySelector("[data-testid='hero']")).not.toBeNull();
    counter.expectRerendered({ welcome: 1, hero: 1, wizard: 1 });

    counter.reset();
    await act(async () => {
      hooks.store.notify();
    });
    counter.expectRerendered({});
  });

  it("hides the empty-home hero when the Nexi welcome page is on, and brings it back when the flag goes off", async () => {
    hooks.store.replace({ ...hooks.initial(), nexiWelcome: true });
    await renderWelcome(root);
    expect(container.querySelector("[data-testid='hero']")).toBeNull();
    expect(container.querySelector("[data-testid='wizard']")).not.toBeNull();
    counter.expectRerendered({ welcome: 1, wizard: 1 });

    counter.reset();
    await act(async () => {
      hooks.store.set({ nexiWelcome: false });
    });
    // The wizard keeps its props, so it sits this update out.
    counter.expectRerendered({ welcome: 1, hero: 1 });
    expect(container.querySelector("[data-testid='hero']")).not.toBeNull();
    expect(container.querySelector("[data-testid='wizard']")).not.toBeNull();
  });

  it("does not show setup when the path is no longer /welcome, even if it was not dismissed", async () => {
    await renderWelcome(root);
    counter.reset();

    await act(async () => {
      hooks.store.set({ pathname: "/" });
    });
    // The empty-home hero is already on screen and sits this update out.
    counter.expectRerendered({ welcome: 1 });
    expect(container.querySelector("[data-testid='wizard']")).toBeNull();
    expect(container.querySelector("[data-testid='hero']")).not.toBeNull();
  });

  it("dismisses setup once, and a later hash change does not reopen it", async () => {
    await renderWelcome(root);
    expect(container.querySelector("[data-testid='wizard']")).not.toBeNull();
    counter.reset();

    await act(async () => {
      await hooks.wizardDone.fn();
    });
    expect(hooks.navigate).toHaveBeenCalledWith({ to: "/", replace: true });
    expect(container.querySelector("[data-testid='wizard']")).toBeNull();
    expect(container.querySelector("[data-testid='hero']")).not.toBeNull();
    counter.expectRerendered({ welcome: 1 });

    counter.reset();
    await act(async () => {
      hooks.store.set({ hash: "#agents:e1" });
    });
    // The route still reads the hash, so it re-renders once, but setup stays closed.
    counter.expectRerendered({ welcome: 1 });
    expect(container.querySelector("[data-testid='wizard']")).toBeNull();
  });

  it("opens a thread when setup finishes with a project, and falls back home if that open fails", async () => {
    await renderWelcome(root);
    counter.reset();

    await act(async () => {
      await hooks.wizardDone.fn({ id: "p1" });
    });
    expect(hooks.openNewThread).toHaveBeenCalledTimes(1);
    expect(hooks.openNewThread).toHaveBeenCalledWith({ id: "p1" }, { replace: true });
    expect(hooks.navigate).not.toHaveBeenCalled();
    expect(container.querySelector("[data-testid='wizard']")).toBeNull();
    counter.expectRerendered({ welcome: 1 });

    await act(async () => {
      root.unmount();
    });
    hooks.openNewThread.mockReset();
    hooks.openNewThread.mockRejectedValue(new Error("open failed"));
    hooks.navigate.mockReset();
    hooks.store.replace(hooks.initial());
    root = createRoot(container);
    await renderWelcome(root);
    counter.reset();
    await act(async () => {
      await hooks.wizardDone.fn({ id: "p2" });
    });
    expect(hooks.openNewThread).toHaveBeenCalledTimes(1);
    expect(hooks.navigate).toHaveBeenCalledWith({ to: "/", replace: true });
    expect(container.querySelector("[data-testid='wizard']")).toBeNull();
    counter.expectRerendered({ welcome: 1 });
  });

  it("marks the hosted-static session as not locally available", async () => {
    hooks.store.replace({ ...hooks.initial(), authStatus: "hosted-static" });
    await renderWelcome(root);
    expect(container.querySelector("[data-testid='wizard-local']")?.textContent).toBe("hosted");
  });
});
