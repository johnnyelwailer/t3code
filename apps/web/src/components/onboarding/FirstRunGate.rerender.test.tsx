/* oxlint-disable t3code/no-dom-test-environment -- The re-render gate requires this sibling name, which is not a browser test; the unit file sets jsdom. */
/* oxlint-disable t3code/require-disposable-render -- The shared render helper imports vite-plus/test/browser and can only run in Browser Mode. */
// @vitest-environment jsdom
/**
 * FirstRunGate holds gate state and subscribes to settings and workspace stores.
 * An unrelated store field, or a location hash change, must not re-render it.
 * A relevant transition (thread count, hydration, the pending timeout) may
 * re-render it once. The render count is the budget.
 */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { FirstRunGate } from "./FirstRunGate";
import { renderCounter } from "~/test/t3team-renderCounter";

type HydrationStatus = "ready" | "failed" | "retrying" | "pending";

interface GateStore {
  readonly hydrationStatus: HydrationStatus;
  readonly onboardingCompletedAt: string | null;
  readonly theme: string;
  readonly bootstrapped: boolean;
  readonly catalogReady: boolean;
  readonly projects: ReadonlyArray<{
    readonly id: string;
    readonly environmentId: string;
    readonly workspaceRoot: string;
  }>;
  readonly threadCount: number;
  readonly soleThread: { readonly id: string } | null;
  readonly serverConfig: {
    readonly cwd: string;
    readonly environment: { readonly environmentId: string };
  } | null;
  readonly serverWelcome: { readonly bootstrapStatus: "pending" | "complete" } | null;
  readonly primaryShellLive: boolean;
  readonly workspaceEvidenceLive: boolean;
  readonly nexiWelcome: boolean;
  readonly pathname: string;
  readonly hash: string;
}

const hooks = vi.hoisted(() => {
  const twoProjects = [
    { id: "p1", environmentId: "e1", workspaceRoot: "/ws/a" },
    { id: "p2", environmentId: "e1", workspaceRoot: "/ws/b" },
  ];
  const completed = (): GateStore => ({
    hydrationStatus: "ready",
    onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
    theme: "dark",
    bootstrapped: true,
    catalogReady: true,
    projects: twoProjects,
    threadCount: 2,
    soleThread: null,
    serverConfig: { cwd: "/ws", environment: { environmentId: "e1" } },
    serverWelcome: { bootstrapStatus: "complete" },
    primaryShellLive: true,
    workspaceEvidenceLive: true,
    nexiWelcome: false,
    pathname: "/",
    hash: "",
  });
  let state = completed();
  const listeners = new Set<() => void>();
  const store = {
    get: () => state,
    set: (patch: Partial<GateStore>) => {
      state = { ...state, ...patch };
      listeners.forEach((listener) => listener());
    },
    notify: () => {
      listeners.forEach((listener) => listener());
    },
    replace: (next: GateStore) => {
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
  const completeOnboarding = vi.fn(async () => {});
  const ensureClientSettingsHydrated = vi.fn(async () => {});
  const autoOpen = { opened: false };
  const count = { fn: (_id: string) => {} };
  const { useSyncExternalStore } = require("react") as typeof import("react");
  function useSelected<S>(select: (state: GateStore) => S): S {
    return useSyncExternalStore(store.subscribe, () => select(store.get()));
  }
  return {
    store,
    navigate,
    completeOnboarding,
    ensureClientSettingsHydrated,
    autoOpen,
    count,
    completed,
    twoProjects,
    useSelected,
  };
});

const completedStore = hooks.completed;
const TWO_PROJECTS = hooks.twoProjects;

vi.mock("effect/reactivity", () => ({
  Atom: {
    make: (fn: unknown) => ({
      fn,
      pipe: (op: (atom: { fn: unknown; label?: string }) => { fn: unknown; label?: string }) =>
        op({ fn }),
    }),
    withLabel: (label: string) => (atom: { fn: unknown }) => ({ ...atom, label }),
  },
}));

vi.mock("@effect/atom-react", () => ({
  useAtomValue: (atom: { readonly label?: string; readonly __id?: string }) => {
    if (atom.label === "web-onboarding-thread-count") {
      return hooks.useSelected((state) => state.threadCount);
    }
    if (atom.label === "web-onboarding-sole-thread") {
      return hooks.useSelected((state) => (state.threadCount === 1 ? state.soleThread : null));
    }
    if (atom.label === "web-onboarding-primary-shell-live" || atom.__id === "shell") {
      return hooks.useSelected((state) => state.primaryShellLive);
    }
    if (atom.label === "web-onboarding-workspace-evidence-live" || atom.__id === "evidence") {
      return hooks.useSelected((state) => state.workspaceEvidenceLive);
    }
    if (atom.__id === "config") {
      return hooks.useSelected((state) => state.serverConfig);
    }
    if (atom.__id === "welcome") {
      return hooks.useSelected((state) => state.serverWelcome);
    }
    return hooks.useSelected((state) => state.serverConfig);
  },
}));

vi.mock("~/state/server", () => ({
  primaryServerConfigAtom: { __id: "config" },
  primaryServerWelcomeAtom: { __id: "welcome" },
}));

vi.mock("~/state/projects", () => ({
  environmentProjects: { projectsAtom: { __id: "projects" } },
}));

vi.mock("~/state/shell", () => ({
  environmentShell: { stateValueAtom: () => ({ __id: "shell-state" }) },
}));

vi.mock("~/state/threads", () => ({
  environmentThreadShells: { threadShellsAtom: { __id: "threads" } },
}));

vi.mock("~/state/entities", () => ({
  useAllEnvironmentShellsBootstrapped: () => hooks.useSelected((state) => state.bootstrapped),
  useProjects: () => hooks.useSelected((state) => state.projects),
}));

vi.mock("~/state/environments", () => ({
  useEnvironments: () => ({ isReady: hooks.useSelected((state) => state.catalogReady) }),
}));

vi.mock("~/hooks/useSettings", () => ({
  useClientSettingsHydrationStatus: () => hooks.useSelected((state) => state.hydrationStatus),
  useClientSettings: (
    select: (settings: { onboardingCompletedAt: string | null; theme: string }) => unknown,
  ) =>
    hooks.useSelected((state) =>
      select({
        onboardingCompletedAt: state.onboardingCompletedAt,
        theme: state.theme,
      }),
    ),
  ensureClientSettingsHydrated: () => hooks.ensureClientSettingsHydrated(),
}));

vi.mock("~/onboarding/firstRun", () => ({
  completeOnboarding: () => hooks.completeOnboarding(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => hooks.navigate,
  useLocation: ({
    select,
  }: {
    select: (location: { pathname: string; hash: string }) => unknown;
  }) => hooks.useSelected((state) => select({ pathname: state.pathname, hash: state.hash })),
}));

vi.mock("~/t3team/welcome/t3team-useNexiWelcomeEnabled", () => ({
  useNexiWelcomeEnabled: () => {
    hooks.count.fn("gate");
    return hooks.useSelected((state) => state.nexiWelcome);
  },
}));

vi.mock("~/t3team/welcome/t3team-welcomeAutoOpen", () => ({
  hasWelcomeAutoOpened: () => hooks.autoOpen.opened,
  markWelcomeAutoOpened: () => {
    hooks.autoOpen.opened = true;
  },
}));

vi.mock("~/components/ui/refresh-icon", () => ({
  RefreshIcon: () => null,
}));

vi.mock("../ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children?: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
}));

const counter = renderCounter();
hooks.count.fn = (id: string) => counter.count(id);

function AppChild() {
  return <div data-testid="app-child">app</div>;
}

function renderGate(props?: { enabled?: boolean; hostedStatic?: boolean }) {
  return (
    <FirstRunGate enabled={props?.enabled ?? true} hostedStatic={props?.hostedStatic ?? false}>
      <AppChild />
    </FirstRunGate>
  );
}

describe("FirstRunGate re-renders", () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    hooks.store.replace(completedStore());
    hooks.navigate.mockReset();
    hooks.completeOnboarding.mockReset();
    hooks.ensureClientSettingsHydrated.mockReset();
    hooks.autoOpen.opened = false;
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
    vi.useRealTimers();
  });

  it("does not re-render when a settings field it does not select changes, or when the location hash changes", async () => {
    await act(async () => {
      root.render(renderGate());
    });
    expect(container.textContent).toContain("app");
    counter.expectRerendered({ gate: 1 });

    counter.reset();
    await act(async () => {
      hooks.store.set({ theme: "light" });
    });
    counter.expectRerendered({});

    await act(async () => {
      hooks.store.set({ hash: "#agents:ignored" });
    });
    counter.expectRerendered({});

    await act(async () => {
      hooks.store.notify();
    });
    counter.expectRerendered({});
  });

  it("does not re-render when a sole-thread field changes in a populated workspace", async () => {
    // soleThreadAtom is null whenever the thread count is not 1, so a title-like
    // change on one of several threads must not reach the gate.
    await act(async () => {
      root.render(renderGate());
    });
    counter.reset();

    await act(async () => {
      hooks.store.set({ soleThread: { id: "t-noise" } });
    });
    counter.expectRerendered({});
  });

  it("re-renders once when the thread count it subscribes to changes, and stays on the app", async () => {
    await act(async () => {
      root.render(renderGate());
    });
    counter.reset();

    await act(async () => {
      hooks.store.set({ threadCount: 3 });
    });
    counter.expectRerendered({ gate: 1 });
    expect(container.textContent).toContain("app");
  });

  it("shows settings recovery when hydration fails, and sits out unrelated workspace noise", async () => {
    hooks.store.replace({
      ...completedStore(),
      hydrationStatus: "failed",
      onboardingCompletedAt: null,
    });
    await act(async () => {
      root.render(renderGate());
    });
    expect(container.textContent).toContain("Could not read settings");
    expect(container.textContent).not.toContain("app");
    counter.reset();

    await act(async () => {
      hooks.store.set({ theme: "light" });
    });
    counter.expectRerendered({});

    await act(async () => {
      hooks.store.set({ hydrationStatus: "retrying" });
    });
    counter.expectRerendered({ gate: 1 });
    expect(container.querySelector("button")?.disabled).toBe(true);
  });

  it("shows connection recovery once when the pending decision times out, and not again after", async () => {
    vi.useFakeTimers();
    hooks.store.replace({
      ...completedStore(),
      onboardingCompletedAt: null,
      bootstrapped: false,
      projects: [],
      threadCount: 0,
    });
    await act(async () => {
      root.render(renderGate());
    });
    expect(container.textContent).not.toContain("app");
    counter.reset();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });
    counter.expectRerendered({ gate: 1 });
    expect(container.textContent).toContain("Still connecting");

    counter.reset();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8_000);
    });
    counter.expectRerendered({});
  });

  it("opens setup from the landing path once, and does not navigate from a direct settings link", async () => {
    const fresh = {
      ...completedStore(),
      onboardingCompletedAt: null,
      projects: [] as GateStore["projects"],
      threadCount: 0,
      soleThread: null,
    };
    hooks.store.replace(fresh);
    await act(async () => {
      root.render(renderGate());
    });
    expect(hooks.navigate).toHaveBeenCalledTimes(1);
    expect(hooks.navigate).toHaveBeenCalledWith({ to: "/welcome", replace: true });
    expect(hooks.autoOpen.opened).toBe(true);
    expect(container.textContent).not.toContain("app");

    counter.reset();
    await act(async () => {
      hooks.store.set({ theme: "light" });
    });
    counter.expectRerendered({});
    expect(hooks.navigate).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.unmount();
    });
    hooks.navigate.mockReset();
    hooks.autoOpen.opened = false;
    hooks.store.replace({ ...fresh, pathname: "/settings" });
    root = createRoot(container);
    counter.reset();
    await act(async () => {
      root.render(renderGate());
    });
    expect(hooks.navigate).not.toHaveBeenCalled();
    expect(container.textContent).toContain("app");

    counter.reset();
    await act(async () => {
      hooks.store.set({ hash: "#section" });
    });
    counter.expectRerendered({});
    expect(hooks.navigate).not.toHaveBeenCalled();
  });

  it("ignores workspace store changes on the hosted-static path, which does not use them for its decision", async () => {
    hooks.store.replace({ ...completedStore(), hydrationStatus: "ready" });
    await act(async () => {
      root.render(renderGate({ enabled: false, hostedStatic: true }));
    });
    expect(container.textContent).toContain("app");
    counter.reset();

    await act(async () => {
      hooks.store.set({ threadCount: 8, soleThread: { id: "t" }, projects: TWO_PROJECTS });
    });
    // The component still subscribes to those atoms, so a value change is one render,
    // then the hosted decision stays on the app and does not loop.
    counter.expectRerendered({ gate: 1 });
    expect(container.textContent).toContain("app");

    counter.reset();
    await act(async () => {
      hooks.store.notify();
    });
    counter.expectRerendered({});
  });
});
