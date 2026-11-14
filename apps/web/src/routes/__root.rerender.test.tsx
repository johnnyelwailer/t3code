/* oxlint-disable t3code/no-dom-test-environment -- The re-render gate requires this sibling name, which is not a browser test; the unit file sets jsdom. */
/* oxlint-disable t3code/require-disposable-render -- The shared render helper imports vite-plus/test/browser and can only run in Browser Mode. */
// @vitest-environment jsdom
/**
 * RootRouteBranch latches a return-from-welcome flag and chooses a full-window
 * welcome or the sidebar shell. EventRouter subscribes only to the server
 * welcome and config. A hash-only change, or a store notify that does not
 * change those values, must not re-render them. The render count is the budget.
 */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { Route } from "./__root";
import { renderCounter } from "~/test/t3team-renderCounter";

interface WelcomePayload {
  readonly bootstrapProjectId: string;
  readonly bootstrapThreadId: string;
  readonly environment: { readonly environmentId: string };
}

interface RootStore {
  readonly pathname: string;
  readonly hash: string;
  readonly nexiWelcome: boolean;
  readonly authStatus: "authenticated" | "hosted-static" | "unauthenticated";
  readonly grouping: { readonly group: string };
  readonly theme: string;
  readonly serverConfig: { readonly cwd: string } | null;
  readonly serverWelcome: WelcomePayload | null;
}

const hooks = vi.hoisted(() => {
  const initial = (): RootStore => ({
    pathname: "/",
    hash: "",
    nexiWelcome: false,
    authStatus: "authenticated",
    grouping: { group: "default" },
    theme: "dark",
    serverConfig: { cwd: "/ws" },
    serverWelcome: null,
  });
  let state = initial();
  const listeners = new Set<() => void>();
  const store = {
    get: () => state,
    set: (patch: Partial<RootStore>) => {
      state = { ...state, ...patch };
      listeners.forEach((listener) => listener());
    },
    notify: () => {
      listeners.forEach((listener) => listener());
    },
    replace: (next: RootStore) => {
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
  const setProjectExpanded = vi.fn();
  const count = { fn: (_id: string) => {} };
  const { useSyncExternalStore } = require("react") as typeof import("react");
  function useSelected<S>(select: (state: RootStore) => S): S {
    return useSyncExternalStore(store.subscribe, () => select(store.get()));
  }
  function Empty() {
    return null;
  }
  function Pass({ children }: { children?: import("react").ReactNode }): import("react").ReactNode {
    return children;
  }
  return { store, initial, navigate, setProjectExpanded, count, useSelected, Empty, Pass };
});

vi.mock("@tanstack/react-router", () => ({
  createRootRoute: (opts: { component: unknown }) => ({
    ...opts,
    options: opts,
    useRouteContext: () => ({
      authGateState: { status: hooks.store.get().authStatus },
    }),
  }),
  useNavigate: () => hooks.navigate,
  useRouter: () => ({ invalidate: vi.fn() }),
  useLocation: ({
    select,
  }: {
    select: (location: { pathname: string; hash: string }) => unknown;
  }) => hooks.useSelected((state) => select({ pathname: state.pathname, hash: state.hash })),
  Outlet: () => {
    hooks.count.fn("outlet");
    return <div data-testid="outlet">outlet</div>;
  },
  Link: ({ children }: { children?: ReactNode }) => <a>{children}</a>,
  redirect: (options: unknown) => {
    throw options;
  },
}));

vi.mock("~/t3team/welcome/t3team-useNexiWelcomeEnabled", () => ({
  useNexiWelcomeEnabled: () => hooks.useSelected((state) => state.nexiWelcome),
}));

// RootRouteBranch calls this on every render before it picks a branch, so it is the branch's counter.
vi.mock("../components/promptLinks/HostedPromptLinkLanding", () => ({
  useHostedPromptLinkLanding: () => {
    hooks.count.fn("branch");
    return null;
  },
}));

vi.mock("../components/AppSidebarLayout", () => ({
  AppSidebarLayout: ({
    children,
    showSidebar,
  }: {
    children?: ReactNode;
    showSidebar?: boolean;
  }) => {
    hooks.count.fn("sidebar");
    return showSidebar === false ? children : <div data-testid="sidebar">{children}</div>;
  },
}));

vi.mock("../components/CommandPalette", () => ({ CommandPalette: hooks.Pass }));
vi.mock("../components/mcp/UseInAnotherAppDialog", () => ({
  UseInAnotherAppDialogHost: hooks.Empty,
}));
vi.mock("../components/CustomSnoozeDialog", () => ({ CustomSnoozeDialogHost: hooks.Empty }));
vi.mock("../components/chat/GuestShareControls", () => ({ GuestShareDialogHost: hooks.Empty }));
vi.mock("../components/AddProjectToMachineDialog", () => ({
  AddProjectToMachineDialogHost: hooks.Empty,
}));
vi.mock("../components/ConfirmDialogHost", () => ({ ConfirmDialogHost: hooks.Empty }));
vi.mock("../components/DevReplayHost", () => ({ DevReplayHost: hooks.Empty }));
vi.mock("../components/onboarding/FirstRunGate", () => ({ FirstRunGate: hooks.Pass }));
vi.mock("../components/cloud/ConnectOnboardingDialog", () => ({
  ConnectOnboardingDialog: hooks.Empty,
}));
vi.mock("../components/cloud/RelayClientInstallDialog", () => ({
  RelayClientInstallDialog: hooks.Empty,
}));
vi.mock("../components/desktop/SshPasswordPromptDialog", () => ({
  SshPasswordPromptDialog: hooks.Empty,
}));
vi.mock("../components/desktop/SnapShotCoordinator", () => ({ SnapShotCoordinator: hooks.Empty }));
vi.mock("../components/desktop/DesktopAppActivationCoordinator", () => ({
  DesktopAppActivationCoordinator: hooks.Empty,
}));
vi.mock("../components/desktop/DesktopWebLinkCoordinator", () => ({
  DesktopWebLinkCoordinator: hooks.Empty,
}));
vi.mock("../cloud/t3team-DesktopRouteAnswerObserver", () => ({
  DesktopRouteAnswerObserver: hooks.Empty,
}));
vi.mock("../components/desktop/RunningThreadKeepAlive", () => ({
  RunningThreadKeepAlive: hooks.Empty,
}));
vi.mock("../components/ReopenClosedViewShortcut", () => ({
  ReopenClosedViewShortcut: hooks.Empty,
}));
vi.mock("../components/ProjectCloneToastCoordinator", () => ({
  ProjectCloneToastCoordinator: hooks.Empty,
}));
vi.mock("../components/settings/ChatGptWelcomeCoordinator", () => ({
  ChatGptWelcomeCoordinator: hooks.Empty,
}));
vi.mock("../components/settings/ThemeEditorHost", () => ({ ThemeEditorHost: hooks.Empty }));
vi.mock("../hooks/useCopyToClipboard", () => ({
  useCopyToClipboard: () => ({ copied: false, copy: () => {} }),
}));
vi.mock("../components/ui/button", () => ({
  Button: ({ children }: { children?: ReactNode }) => <button type="button">{children}</button>,
}));
vi.mock("~/components/MorphIcon", () => ({ MorphIcon: hooks.Empty }));
vi.mock("../components/ui/standalone-page", () => ({
  StandalonePage: hooks.Pass,
  StandalonePageHeader: hooks.Empty,
}));
vi.mock("../components/ui/toast", () => ({
  ToastProvider: hooks.Pass,
  AnchoredToastProvider: hooks.Pass,
}));
vi.mock("../env", () => ({ isElectron: false }));
vi.mock("../hooks/useSettings", () => ({
  useClientSettings: () => {
    hooks.count.fn("eventRouter");
    return hooks.useSelected((state) => state.grouping);
  },
}));
vi.mock("../observability/clientTracing", () => ({ configureClientTracing: () => {} }));
vi.mock("../environments/primary", () => ({
  resolveInitialServerAuthGateState: async () => ({ status: "authenticated" }),
}));
vi.mock("../hostedPairing", () => ({
  hasHostedPairingRequest: () => false,
  isHostedStaticApp: () => false,
}));
vi.mock("../t3team/hooks/t3team-atlassianOAuthRedirect", () => ({
  isAtlassianOAuthCallbackPath: () => false,
}));
vi.mock("../t3team/t3team-RootCoordinators", () => ({ T3TeamRootCoordinators: hooks.Empty }));
vi.mock("../t3team/t3team-WindowDragStrip", () => ({
  withT3TeamWindowDragStrip: (component: unknown) => component,
}));
vi.mock("../cloud/t3team-CloudSessionSignInDialogHost", () => ({
  CloudSessionSignInDialogHost: hooks.Empty,
}));
vi.mock("../cloud/t3team-CloudQueuedSendFlusher", () => ({ CloudQueuedSendFlusher: hooks.Empty }));
vi.mock("../t3team/voice/t3team-VoiceSessionHost", () => ({ T3TeamVoiceSessionHost: hooks.Empty }));
vi.mock("../t3team/t3team-appBrandName", () => ({ useT3TeamAppDisplayName: () => "Nexi Work" }));
vi.mock("../t3team/chat/t3team-threadComposingSignal", () => ({}));
vi.mock("../localEnvironment", () => ({ isLocalEnvironmentDisabled: () => false }));
vi.mock("../lib/desktopSnapShot", () => ({ getDesktopSnapShotBridge: () => null }));
vi.mock("../lib/snapShotSetupResume", () => ({ shouldResumeSnapShotSetupOnStartup: () => false }));
vi.mock("../uiStateStore", () => ({
  useUiStateStore: { getState: () => ({ setProjectExpanded: hooks.setProjectExpanded }) },
}));
vi.mock("../state/entities", () => ({ readProject: () => null }));
vi.mock("../state/server", () => ({
  primaryServerConfigAtom: { __id: "config" },
  primaryServerWelcomeAtom: { __id: "welcome" },
  // Read at module load by state/presentation, which the root reaches through upstream imports.
  serverEnvironment: { configValueAtom: { __id: "config" } },
}));
vi.mock("lucide", () => ({ Check: hooks.Empty, Copy: hooks.Empty }));

vi.mock("@effect/atom-react", () => ({
  useAtomValue: (atom: { readonly __id?: string }) => {
    if (atom.__id === "welcome") {
      return hooks.useSelected((state) => state.serverWelcome);
    }
    return hooks.useSelected((state) => state.serverConfig);
  },
}));

const counter = renderCounter();
hooks.count.fn = (id: string) => counter.count(id);

const RootView = Route.options.component;
if (RootView === undefined) {
  throw new Error("root route is missing its component");
}

const WELCOME: WelcomePayload = {
  bootstrapProjectId: "proj-1",
  bootstrapThreadId: "thread-1",
  environment: { environmentId: "env-1" },
};

describe("RootRouteBranch re-renders", () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    hooks.store.replace(hooks.initial());
    hooks.navigate.mockReset();
    hooks.navigate.mockResolvedValue(undefined);
    hooks.setProjectExpanded.mockReset();
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

  it("does not re-render on a hash-only change or a store notify that keeps selected values", async () => {
    await act(async () => {
      root.render(<RootView />);
    });
    expect(container.querySelector("[data-testid='sidebar']")).not.toBeNull();
    expect(container.querySelector("[data-testid='outlet']")).not.toBeNull();
    counter.expectRerendered({ branch: 1, sidebar: 1, outlet: 1, eventRouter: 1 });

    counter.reset();
    await act(async () => {
      hooks.store.set({ hash: "#agents:e1" });
    });
    counter.expectRerendered({});

    await act(async () => {
      hooks.store.set({ theme: "light" });
    });
    counter.expectRerendered({});

    await act(async () => {
      hooks.store.notify();
    });
    counter.expectRerendered({});
  });

  it("renders the welcome page without the sidebar, whichever welcome page is on", async () => {
    hooks.store.replace({ ...hooks.initial(), pathname: "/welcome", nexiWelcome: true });
    await act(async () => {
      root.render(<RootView />);
    });
    expect(container.querySelector("[data-testid='sidebar']")).toBeNull();
    expect(container.querySelector("[data-testid='outlet']")).not.toBeNull();
    // EventRouter is not on the welcome branch; the layout renders with its sidebar hidden.
    counter.expectRerendered({ branch: 1, sidebar: 1, outlet: 1 });

    counter.reset();
    await act(async () => {
      hooks.store.set({ nexiWelcome: false });
    });
    // The welcome route picks its page; the root does not read the flag.
    counter.expectRerendered({});
    expect(container.querySelector("[data-testid='sidebar']")).toBeNull();
  });

  it("latches a visit to /welcome and does not navigate for that bootstrap thread on the way back", async () => {
    hooks.store.replace({ ...hooks.initial(), pathname: "/welcome", nexiWelcome: true });
    await act(async () => {
      root.render(<RootView />);
    });
    expect(hooks.navigate).not.toHaveBeenCalled();

    counter.reset();
    await act(async () => {
      hooks.store.set({ pathname: "/", nexiWelcome: false, serverWelcome: WELCOME });
    });
    await act(async () => {
      await Promise.resolve();
    });
    // The visit latched skip-initial-bootstrap, so EventRouter records the thread and does not navigate.
    expect(hooks.navigate).not.toHaveBeenCalled();
    expect(hooks.setProjectExpanded).toHaveBeenCalled();
    counter.expectRerendered({ branch: 1, sidebar: 1, outlet: 1, eventRouter: 1 });

    counter.reset();
    await act(async () => {
      hooks.store.notify();
    });
    await act(async () => {
      await Promise.resolve();
    });
    counter.expectRerendered({});
    expect(hooks.navigate).not.toHaveBeenCalled();
  });

  it("navigates once for a new bootstrap thread, and not again for the same thread or a config-only change", async () => {
    await act(async () => {
      root.render(<RootView />);
    });
    counter.reset();

    await act(async () => {
      hooks.store.set({ serverWelcome: WELCOME });
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(hooks.navigate).toHaveBeenCalledTimes(1);
    expect(hooks.navigate).toHaveBeenCalledWith({
      to: "/$environmentId/$threadId",
      params: { environmentId: "env-1", threadId: "thread-1" },
      replace: true,
    });
    // Only EventRouter subscribes to the welcome payload; the branch sits it out.
    counter.expectRerendered({ eventRouter: 1 });

    counter.reset();
    await act(async () => {
      hooks.store.set({ serverConfig: { cwd: "/other" } });
    });
    await act(async () => {
      await Promise.resolve();
    });
    counter.expectRerendered({ eventRouter: 1 });
    expect(hooks.navigate).toHaveBeenCalledTimes(1);

    counter.reset();
    await act(async () => {
      hooks.store.set({ serverWelcome: { ...WELCOME } });
    });
    await act(async () => {
      await Promise.resolve();
    });
    // New object, same thread id: EventRouter re-renders once, the handled-id guard blocks a second navigation.
    counter.expectRerendered({ eventRouter: 1 });
    expect(hooks.navigate).toHaveBeenCalledTimes(1);
  });

  it("renders only the outlet on a guest path, and keeps that bounded across a hash change", async () => {
    hooks.store.replace({ ...hooks.initial(), pathname: "/guest" });
    await act(async () => {
      root.render(<RootView />);
    });
    expect(container.querySelector("[data-testid='sidebar']")).toBeNull();
    expect(container.querySelector("[data-testid='outlet']")).not.toBeNull();
    counter.expectRerendered({ branch: 1, outlet: 1 });

    counter.reset();
    await act(async () => {
      hooks.store.set({ hash: "#x" });
    });
    counter.expectRerendered({});
  });

  it("renders a detached surface without the sidebar or EventRouter", async () => {
    hooks.store.replace({ ...hooks.initial(), pathname: "/t3team-detached/panel" });
    await act(async () => {
      root.render(<RootView />);
    });
    expect(container.querySelector("[data-testid='sidebar']")).toBeNull();
    expect(container.querySelector("[data-testid='outlet']")).not.toBeNull();
    counter.expectRerendered({ branch: 1, outlet: 1 });
  });
});
