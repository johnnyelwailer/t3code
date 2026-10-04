// @vitest-environment jsdom
import { EnvironmentId, type CloudSession } from "@t3tools/contracts";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("~/rpc/atomRegistry", () => ({ appAtomRegistry: { refresh: mocks.refresh } }));
vi.mock("~/state/t3team-cloudSessions", () => ({
  cloudSessionEnvironment: { list: () => "list-atom" },
}));
vi.mock("~/state/relay", () => ({ relayEnvironmentDiscovery: { refresh: "relay-refresh" } }));
vi.mock("~/state/use-atom-command", () => ({ useAtomCommand: () => vi.fn() }));

import { CLOUD_SESSION_IDLE_REFRESH_INTERVAL_MS } from "./t3team-cloudSessionPolling";
import { useCloudSessionListRefresh } from "./t3team-useCloudSessionListRefresh";

const session = (phase: CloudSession["phase"]): CloudSession => ({
  sessionId: `s-${phase}`,
  providerKind: "github_actions",
  phase,
  elapsedSeconds: 0,
  remainingSeconds: null,
  machineLabel: "machine",
  failureReason: null,
  detailsUrl: null,
});

let root: Root | null = null;

function Probe({ environmentId, sessions }: { environmentId: string; sessions: CloudSession[] }) {
  useCloudSessionListRefresh(EnvironmentId.make(environmentId), true, sessions);
  return null;
}

function mount(environmentId: string, sessions: CloudSession[]) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(<Probe environmentId={environmentId} sessions={sessions} />));
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.refresh.mockClear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useCloudSessionListRefresh cadence", () => {
  it("polls every 5 s while a session is provisioning", () => {
    // A distinct environment per test: the refresh gate is module-level.
    mount("env-busy", [session("preparing")]);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(15_000));
    expect(mocks.refresh).toHaveBeenCalledTimes(4);
  });

  it("backs off to the idle interval when nothing is provisioning", () => {
    mount("env-idle", [session("ready"), session("stopped")]);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(CLOUD_SESSION_IDLE_REFRESH_INTERVAL_MS - 1));
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(1));
    expect(mocks.refresh).toHaveBeenCalledTimes(2);
  });
});
