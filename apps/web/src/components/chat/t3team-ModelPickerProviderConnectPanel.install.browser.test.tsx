/**
 * Install-and-connect on a cloud session: the click must target the cloud environment id, and a
 * missing environment must surface an error instead of silently doing nothing (hive#1219).
 */
import {
  EnvironmentId,
  ProviderDriverKind,
  ProviderInstanceId,
  type ToolAuthState,
} from "@t3tools/contracts";
import { useSyncExternalStore } from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import { deriveProviderInstanceEntries } from "../../providerInstances";
import { render } from "../../../test/render";

const harness = vi.hoisted(() => {
  type Listener = () => void;
  const listeners = new Set<Listener>();
  const state = {
    current: new Map() as Map<string, ToolAuthState>,
    installCalls: [] as Array<{ environmentId: unknown; input: unknown }>,
    toasts: [] as Array<{ title?: string; description?: string; type?: string }>,
  };
  return {
    state,
    listeners,
    set(next: Map<string, ToolAuthState>) {
      state.current = next;
      for (const listener of listeners) listener();
    },
  };
});

vi.mock("../../state/t3team-toolauth", async () => {
  const actual = await vi.importActual<typeof import("../../state/t3team-toolauth")>(
    "../../state/t3team-toolauth",
  );
  return {
    ...actual,
    useToolAuthStates: () =>
      useSyncExternalStore(
        (listener) => {
          harness.listeners.add(listener);
          return () => harness.listeners.delete(listener);
        },
        () => harness.state.current,
      ),
    useToolAuthActions: (
      meta: { readonly label: string; readonly tool: string },
      targetEnvironmentId?: unknown,
    ) => {
      const primary = EnvironmentId.make("env-primary");
      const environmentId =
        targetEnvironmentId === undefined || targetEnvironmentId === null
          ? null
          : (targetEnvironmentId as typeof primary);
      return {
        environmentId,
        onConnect: () => {},
        onSubmitCode: () => {},
        onCancel: () => {},
        onInstall: () => {
          if (!environmentId) {
            harness.state.toasts.push({
              type: "error",
              title: `Could not install ${meta.label}`,
              description: "No cloud session environment is available to run this on yet.",
            });
            return;
          }
          harness.state.installCalls.push({
            environmentId,
            input: { tool: meta.tool },
          });
        },
      };
    },
  };
});

vi.mock("../../state/environments", () => ({
  usePrimaryEnvironmentId: () => null,
}));
vi.mock("../../cloud/t3team-cloudMachineSignIn", () => ({
  useSignInDescriptionForEnvironment: () => null,
  useToolAuthMachineLabel: () => "the cloud machine",
}));
vi.mock("../../t3team/t3team-useToolAuthEnvironmentFlag", () => ({
  useToolAuthEnvironmentAvailability: () => "enabled",
}));
vi.mock("../../state/server", () => ({ serverEnvironment: { refreshProviders: "refresh" } }));
vi.mock("../../state/use-atom-command", () => ({
  useAtomCommand: () => vi.fn(),
}));

const { ModelPickerProviderConnectPanel } =
  await import("./t3team-ModelPickerProviderConnectPanel");

const cloud = EnvironmentId.make("env-cloud");
const [claude] = deriveProviderInstanceEntries([
  {
    instanceId: ProviderInstanceId.make("claudeAgent"),
    driver: ProviderDriverKind.make("claudeAgent"),
    displayName: "Claude Code",
    enabled: true,
    installed: false,
    version: null,
    status: "error",
    auth: { status: "unknown" },
    checkedAt: "2026-01-01T00:00:00.000Z",
    models: [],
    slashCommands: [],
    skills: [],
  },
]);

describe("model picker install on a cloud session", () => {
  it("clicks Install and connect against the cloud environment id", async () => {
    harness.state.installCalls.length = 0;
    harness.state.toasts.length = 0;
    harness.set(new Map());
    await using screen = await render(
      <ModelPickerProviderConnectPanel
        entry={claude!}
        tool="claude"
        readiness="needsInstall"
        environmentId={cloud}
      />,
      { router: false },
    );
    await userEvent.click(screen.getByRole("button", { name: "Install and connect" }));
    expect(harness.state.installCalls).toEqual([
      { environmentId: cloud, input: { tool: "claude" } },
    ]);
    expect(harness.state.toasts).toEqual([]);
  });

  it("shows an error when there is no environment to install on", async () => {
    harness.state.installCalls.length = 0;
    harness.state.toasts.length = 0;
    harness.set(new Map());
    await using screen = await render(
      <ModelPickerProviderConnectPanel
        entry={claude!}
        tool="claude"
        readiness="needsInstall"
        environmentId={null}
      />,
      { router: false },
    );
    expect(
      screen.getByText("The cloud machine isn't ready to run this yet.", { exact: false }),
    ).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(harness.state.installCalls).toEqual([]);
    expect(harness.state.toasts).toEqual([
      {
        type: "error",
        title: "Could not install Claude Code",
        description: "No cloud session environment is available to run this on yet.",
      },
    ]);
  });
});
