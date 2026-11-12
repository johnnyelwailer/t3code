/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  EnvironmentId,
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProvider,
} from "@t3tools/contracts";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

type RefreshResult = { _tag: "Success"; value: { providers: readonly unknown[] } };

const { mockRefreshProviders } = vi.hoisted(() => ({
  mockRefreshProviders: vi.fn((_value: unknown): Promise<RefreshResult> =>
    Promise.resolve({ _tag: "Success", value: { providers: [] } }),
  ),
}));

vi.mock("~/state/use-atom-command", () => ({
  useAtomCommand: () => mockRefreshProviders,
}));

import { useProviderWorkspaceSnapshotRefresh } from "./t3team-useProviderWorkspaceSnapshotRefresh";

const ENVIRONMENT_ID = EnvironmentId.make("env-1");
const INSTANCE_ID = ProviderInstanceId.make("claudeAgent");

function provider(input: {
  instanceId: string;
  snapshot?: { cwd: string; checkedAt: string };
}): ServerProvider {
  const base: ServerProvider = {
    instanceId: ProviderInstanceId.make(input.instanceId),
    driver: ProviderDriverKind.make("claudeAgent"),
    enabled: true,
    installed: true,
    version: null,
    status: "ready",
    auth: { status: "unknown" },
    checkedAt: "2026-10-19T07:00:00.000Z",
    models: [],
    slashCommands: [],
    skills: [],
  };
  if (input.snapshot) {
    return {
      ...base,
      workspaceSnapshots: [{ ...input.snapshot, slashCommands: [], skills: [] }],
    };
  }
  return base;
}

function renderHook(input: Parameters<typeof useProviderWorkspaceSnapshotRefresh>[0]) {
  let root: Root | null = null;
  const host = document.createElement("div");
  document.body.append(host);

  function Probe() {
    useProviderWorkspaceSnapshotRefresh(input);
    return null;
  }

  act(() => {
    root = createRoot(host);
    root.render(<Probe />);
  });

  return {
    unmount: () => {
      act(() => root?.unmount());
      host.remove();
      root = null;
    },
  };
}

describe("useProviderWorkspaceSnapshotRefresh", () => {
  beforeEach(() => {
    mockRefreshProviders.mockClear();
  });

  it("requests a scan when the provider has no complete snapshot for the cwd", () => {
    const rendered = renderHook({
      provider: provider({ instanceId: "claudeAgent" }),
      instanceId: INSTANCE_ID,
      cwd: "/workspace/ies-ng",
      environmentId: ENVIRONMENT_ID,
    });
    expect(mockRefreshProviders).toHaveBeenCalledTimes(1);
    expect(mockRefreshProviders.mock.calls[0]?.[0]).toEqual({
      environmentId: ENVIRONMENT_ID,
      input: { instanceId: INSTANCE_ID, cwd: "/workspace/ies-ng" },
    });
    rendered.unmount();
  });

  it("does not request when a current snapshot for the cwd already exists", () => {
    const rendered = renderHook({
      provider: provider({
        instanceId: "claudeAgent",
        snapshot: { cwd: "/workspace/ies-ng", checkedAt: new Date().toISOString() },
      }),
      instanceId: INSTANCE_ID,
      cwd: "/workspace/ies-ng",
      environmentId: ENVIRONMENT_ID,
    });
    expect(mockRefreshProviders).not.toHaveBeenCalled();
    rendered.unmount();
  });

  it("ignores snapshots of other workspaces when deciding to rescan", () => {
    const rendered = renderHook({
      provider: provider({
        instanceId: "claudeAgent",
        snapshot: { cwd: "/workspace/other-repo", checkedAt: new Date().toISOString() },
      }),
      instanceId: INSTANCE_ID,
      cwd: "/workspace/ies-ng",
      environmentId: ENVIRONMENT_ID,
    });
    expect(mockRefreshProviders).toHaveBeenCalledTimes(1);
    rendered.unmount();
  });

  it("stays idle without a provider, instance or cwd", () => {
    const rendered = renderHook({
      provider: null,
      instanceId: null,
      cwd: null,
      environmentId: ENVIRONMENT_ID,
    });
    expect(mockRefreshProviders).not.toHaveBeenCalled();
    rendered.unmount();
  });
});
