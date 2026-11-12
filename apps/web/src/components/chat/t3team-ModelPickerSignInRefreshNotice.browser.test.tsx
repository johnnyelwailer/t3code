import {
  EnvironmentId,
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProvider,
  type ToolAuthState,
} from "@t3tools/contracts";
import { useSyncExternalStore } from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import { act, render } from "../../../test/render";
import { deriveProviderInstanceEntries, type ProviderInstanceEntry } from "../../providerInstances";

/**
 * The sign-in refresh notice across the unauthenticated-to-connected transition on the panel
 * that hosts it: a finished sign-in asks the machine to re-check the provider exactly once, and
 * the finished state matches the re-check's answer (Sign in, not a Check again loop).
 */
const harness = vi.hoisted(() => {
  type Listener = () => void;
  type States = Map<string, ToolAuthState>;
  const listeners = new Set<Listener>();
  const state = {
    current: new Map<string, ToolAuthState>(),
    refresh: vi.fn(),
    connect: vi.fn(),
  };
  return {
    state,
    listeners,
    set(next: States) {
      state.current = next;
      for (const listener of listeners) listener();
    },
  };
});

vi.mock("../../state/t3team-toolauth", () => ({
  useToolAuthStates: () =>
    useSyncExternalStore(
      (listener) => {
        harness.listeners.add(listener);
        return () => harness.listeners.delete(listener);
      },
      () => harness.state.current,
    ),
  useToolAuthActions: () => ({
    onConnect: harness.state.connect,
    onInstall: () => {},
    onSubmitCode: () => {},
    onCancel: () => {},
  }),
}));
vi.mock("../../state/environments", () => ({
  usePrimaryEnvironmentId: () => EnvironmentId.make("env-primary"),
}));
vi.mock("../../cloud/t3team-cloudMachineSignIn", () => ({
  useSignInDescriptionForEnvironment: () => null,
  useToolAuthMachineLabel: () => "this cloud machine",
}));
vi.mock("~/t3team/t3team-useToolAuthEnvironmentFlag", () => ({
  useToolAuthEnvironmentAvailability: () => "enabled",
}));
vi.mock("../../state/server", () => ({ serverEnvironment: { refreshProviders: "refresh" } }));
vi.mock("../../state/use-atom-command", () => ({
  useAtomCommand: () => harness.state.refresh,
}));

const { ModelPickerProviderConnectPanel } =
  await import("./t3team-ModelPickerProviderConnectPanel");

const cloud = EnvironmentId.make("env-cloud");
const claudeInstance = ProviderInstanceId.make("claudeAgent");
const claudeLapsed: ServerProvider = {
  instanceId: claudeInstance,
  driver: ProviderDriverKind.make("claudeAgent"),
  displayName: "Claude",
  enabled: true,
  installed: true,
  version: null,
  status: "warning",
  auth: { status: "unauthenticated" },
  checkedAt: "2026-01-01T00:00:00.000Z",
  models: [],
  slashCommands: [],
  skills: [],
};
const [claude] = deriveProviderInstanceEntries([claudeLapsed]);
const claudeRecheckedSnapshot: ServerProvider = {
  ...claudeLapsed,
  status: "ready",
  auth: { status: "authenticated" },
};
const [claudeRechecked] = deriveProviderInstanceEntries([claudeRecheckedSnapshot]);
const claudeUnknownSnapshot: ServerProvider = { ...claudeLapsed, auth: { status: "unknown" } };
const [claudeUnknownProbe] = deriveProviderInstanceEntries([claudeUnknownSnapshot]);

const panel = (entry: ProviderInstanceEntry) => (
  <ModelPickerProviderConnectPanel
    entry={entry}
    tool="claude"
    readiness="needsAuth"
    environmentId={cloud}
  />
);

// Every render below passes `router: false`: the panel has no links or navigation.
const renderPanel = (entry: ProviderInstanceEntry) => render(panel(entry), { router: false });

function setupRefresh(answeredProviders: ReadonlyArray<ServerProvider>) {
  harness.state.connect.mockReset();
  harness.state.refresh.mockReset();
  harness.state.refresh.mockResolvedValue({
    _tag: "Success",
    value: { providers: answeredProviders },
  });
}

function phase(next: Partial<ToolAuthState> & Pick<ToolAuthState, "phase">) {
  return act(async () => {
    harness.set(new Map<string, ToolAuthState>([["claude", { tool: "claude", ...next }]]));
  });
}

describe("sign-in refresh notice across the transition", () => {
  it("a sign-in on top of a stale unauthenticated probe re-checks once, then shows the provider signed in", async () => {
    harness.state.current = new Map<string, ToolAuthState>();
    setupRefresh([claudeRecheckedSnapshot]);
    await using screen = await renderPanel(claude!);
    await phase({ phase: "connected", account: "pj@example.com" });
    expect(harness.state.refresh).toHaveBeenCalledTimes(1);
    expect(harness.state.refresh).toHaveBeenCalledWith({
      environmentId: cloud,
      input: { instanceId: claudeInstance },
    });
    // The live list hands the panel the re-checked entry; the card no longer says expired.
    await screen.rerender(panel(claudeRechecked!));
    await expect.element(screen.getByText("Signed in as pj@example.com")).toBeInTheDocument();
    expect(screen.container.textContent).not.toContain("Not authenticated");
  });

  it("a stale connected phase against an unauthenticated probe shows Not authenticated with Sign in", async () => {
    harness.state.current = new Map<string, ToolAuthState>();
    setupRefresh([claudeLapsed]);
    await using screen = await renderPanel(claude!);
    await phase({ phase: "connected", account: "ada@nexplore.com" });
    await expect
      .element(screen.getByText("Not authenticated. Sign in to use this account."))
      .toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(harness.state.connect).toHaveBeenCalledTimes(1);
  });

  it("an unknown probe is never called unauthenticated", async () => {
    harness.state.current = new Map<string, ToolAuthState>();
    setupRefresh([claudeUnknownSnapshot]);
    await using screen = await renderPanel(claudeUnknownProbe!);
    await phase({ phase: "connected", account: "ada@nexplore.com" });
    await expect
      .element(screen.getByText("has not reported its models yet", { exact: false }))
      .toBeInTheDocument();
    expect(screen.container.textContent).not.toContain("Not authenticated");
  });
});
