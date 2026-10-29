import {
  EnvironmentId,
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProvider,
  type ToolAuthState,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { useSyncExternalStore } from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import { deriveProviderInstanceEntries } from "../../providerInstances";
import { act, render } from "../../../test/render";

/**
 * The whole "not installed" journey in the picker's connect panel, on a cloud machine:
 * Install -> installing -> that provider's sign-in -> signed in -> the machine re-checks the
 * provider so the models become selectable without a reload. Plus the failure branches.
 */
const harness = vi.hoisted(() => {
  type Listener = () => void;
  const listeners = new Set<Listener>();
  const state = {
    current: undefined as unknown,
    refresh: vi.fn(),
    install: vi.fn(),
    connect: vi.fn(),
    cancel: vi.fn(),
  };
  return {
    state,
    listeners,
    set(next: unknown) {
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
    onInstall: harness.state.install,
    onSubmitCode: () => {},
    onCancel: harness.state.cancel,
  }),
}));
vi.mock("../../state/environments", () => ({
  usePrimaryEnvironmentId: () => EnvironmentId.make("env-primary"),
}));
vi.mock("../../cloud/t3team-cloudMachineSignIn", () => ({
  useSignInDescriptionForEnvironment: () => null,
}));
vi.mock("../../state/server", () => ({ serverEnvironment: { refreshProviders: "refresh" } }));
vi.mock("../../state/use-atom-command", () => ({
  useAtomCommand: () => harness.state.refresh,
}));

const { ModelPickerProviderConnectPanel } =
  await import("./t3team-ModelPickerProviderConnectPanel");

const cloud = EnvironmentId.make("env-cloud");
const codexInstance = ProviderInstanceId.make("codex");
const codexSnapshot: ServerProvider = {
  instanceId: codexInstance,
  driver: ProviderDriverKind.make("codex"),
  displayName: "Codex",
  enabled: true,
  installed: false,
  version: null,
  status: "error",
  auth: { status: "unknown" },
  checkedAt: "2026-01-01T00:00:00.000Z",
  models: [],
  slashCommands: [],
  skills: [],
};
const [codex] = deriveProviderInstanceEntries([codexSnapshot]);

function setup(refresh: "pending" | "settled" | "failed" = "settled") {
  harness.state.current = new Map();
  harness.state.install.mockReset();
  harness.state.connect.mockReset();
  harness.state.refresh.mockReset();
  if (refresh === "pending") harness.state.refresh.mockImplementation(() => new Promise(() => {}));
  else if (refresh === "failed")
    harness.state.refresh.mockResolvedValue({
      _tag: "Failure",
      cause: Cause.fail(new Error("machine unreachable")),
    });
  else harness.state.refresh.mockResolvedValue({ _tag: "Success", value: { providers: [] } });
}

const panel = (
  <ModelPickerProviderConnectPanel
    entry={codex!}
    tool="codex"
    readiness="needsInstall"
    environmentId={cloud}
  />
);

function phase(next: Partial<ToolAuthState> & Pick<ToolAuthState, "phase">) {
  return act(async () => {
    harness.set(new Map([["codex", { tool: "codex", ...next }]]));
  });
}

// Every render below passes `router: false`: the panel has no links or navigation.
describe("model picker connect panel journey", () => {
  it("not installed -> install -> sign-in -> signed in -> the machine re-checks the provider", async () => {
    setup("pending");
    await using screen = await render(panel, { router: false });
    await userEvent.click(screen.getByRole("button", { name: "Install and connect" }));
    expect(harness.state.install).toHaveBeenCalledTimes(1);

    await phase({ phase: "installing", installLog: "added 1 package" });
    await expect.element(screen.getByText("Installing", { exact: false })).toBeInTheDocument();

    await phase({
      phase: "awaiting-open",
      url: "https://auth.openai.com/device",
      displayCode: "AB12-CD34",
    });
    await expect.element(screen.getByText("AB12-CD34")).toBeInTheDocument();
    expect(harness.state.refresh).not.toHaveBeenCalled();

    await phase({ phase: "connected", account: "pj@example.com" });
    await expect
      .element(screen.getByText("Loading Codex models", { exact: false }))
      .toBeInTheDocument();
    expect(harness.state.refresh).toHaveBeenCalledTimes(1);
    expect(harness.state.refresh).toHaveBeenCalledWith({
      environmentId: cloud,
      input: { instanceId: codexInstance },
    });
  });

  it("a re-check that leaves the provider not ready offers a retry, not a dead end", async () => {
    setup();
    await using screen = await render(panel, { router: false });
    await phase({ phase: "connected" });
    await expect
      .element(screen.getByText("has not reported its models yet", { exact: false }))
      .toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Check again" }));
    await vi.waitFor(() => expect(harness.state.refresh).toHaveBeenCalledTimes(2));
  });

  it("a re-check that cannot run says why and offers a retry", async () => {
    setup("failed");
    await using screen = await render(panel, { router: false });
    await phase({ phase: "connected" });
    await expect
      .element(screen.getByText("machine unreachable", { exact: false }))
      .toBeInTheDocument();
    await expect.element(screen.getByRole("button", { name: "Check again" })).toBeInTheDocument();
  });

  it("a failed install shows the installer's message and retries the install", async () => {
    setup();
    await using screen = await render(panel, { router: false });
    await phase({ phase: "failed", message: "npm ERR! 403 Forbidden" });
    await expect
      .element(screen.getByText("npm ERR! 403 Forbidden", { exact: false }))
      .toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(harness.state.install).toHaveBeenCalledTimes(1);
    expect(harness.state.refresh).not.toHaveBeenCalled();
  });

  it("an expired or cancelled sign-in offers Reconnect without re-checking the provider", async () => {
    setup();
    await using screen = await render(panel, { router: false });
    await phase({ phase: "expired", message: "The code expired." });
    await expect.element(screen.getByText("The code expired.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reconnect" }));
    expect(harness.state.connect).toHaveBeenCalledTimes(1);
    expect(harness.state.refresh).not.toHaveBeenCalled();
  });

  it("a re-check that already reports the provider ready keeps saying models are loading", async () => {
    setup();
    harness.state.refresh.mockResolvedValue({
      _tag: "Success",
      value: {
        providers: [
          { ...codexSnapshot, installed: true, status: "ready", auth: { status: "authenticated" } },
        ],
      },
    });
    await using screen = await render(panel, { router: false });
    await phase({ phase: "connected" });
    await vi.waitFor(() => expect(harness.state.refresh).toHaveBeenCalledTimes(1));
    await expect
      .element(screen.getByText("Loading Codex models", { exact: false }))
      .toBeInTheDocument();
    expect(screen.container.textContent).not.toContain("has not reported");
  });

  it("signing in again after Reconnect shows the new check, not the previous answer", async () => {
    setup();
    await using screen = await render(panel, { router: false });
    await phase({ phase: "connected" });
    await expect
      .element(screen.getByText("has not reported", { exact: false }))
      .toBeInTheDocument();

    harness.state.refresh.mockImplementation(() => new Promise(() => {}));
    await phase({ phase: "starting" });
    await phase({ phase: "connected" });
    await expect
      .element(screen.getByText("Loading Codex models", { exact: false }))
      .toBeInTheDocument();
    expect(screen.container.textContent).not.toContain("has not reported");
  });
});
