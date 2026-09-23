// @vitest-environment jsdom
import { EnvironmentId, type CloudSession } from "@t3tools/contracts";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { useCloudSessionEnvironmentExit } from "./t3team-useCloudSessionEnvironmentExit";

const { toastAdd } = vi.hoisted(() => ({ toastAdd: vi.fn() }));
vi.mock("~/components/ui/toast", () => ({ toastManager: { add: toastAdd } }));

const ENV = EnvironmentId.make("env-cloud-1");
const PRIMARY = EnvironmentId.make("env-primary");

type HookInput = Parameters<typeof useCloudSessionEnvironmentExit>[0];
type HookValue = ReturnType<typeof useCloudSessionEnvironmentExit>;

function session(sessionId: string, phase: CloudSession["phase"]): CloudSession {
  return {
    sessionId,
    providerKind: "github_actions",
    phase,
    elapsedSeconds: 0,
    remainingSeconds: null,
    machineLabel: "machine",
    failureReason: null,
    detailsUrl: null,
  };
}

let root: Root | null = null;
let container: HTMLElement | null = null;
let captured: HookValue | null = null;

function Probe({ input }: { input: HookInput }) {
  captured = useCloudSessionEnvironmentExit(input);
  return null;
}

function mount(input: HookInput) {
  captured = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(<Probe input={input} />);
  });
}

beforeEach(() => {
  toastAdd.mockClear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

describe("useCloudSessionEnvironmentExit", () => {
  it("reports no live session for an environment before anything is registered", () => {
    const cancelSession = vi.fn().mockResolvedValue({ _tag: "Success" as const });
    mount({
      sessions: [session("s1", "ready")],
      environmentId: PRIMARY,
      cancelSession,
      refreshCloudSessionList: vi.fn(),
      refreshRelayEnvironments: vi.fn(),
    });

    expect(captured!.hasLiveCloudSession(ENV)).toBe(false);
    captured!.stopEnvironment(ENV);
    expect(cancelSession).not.toHaveBeenCalled();
  });

  it("links a session to its machine once connect reports it registered", () => {
    const cancelSession = vi.fn().mockResolvedValue({ _tag: "Success" as const });
    mount({
      sessions: [session("s1", "ready")],
      environmentId: PRIMARY,
      cancelSession,
      refreshCloudSessionList: vi.fn(),
      refreshRelayEnvironments: vi.fn(),
    });

    act(() => {
      captured!.onRegistered("s1", ENV);
    });

    expect(captured!.hasLiveCloudSession(ENV)).toBe(true);
  });

  it("stops the linked live session through the server cancel path", async () => {
    const cancelSession = vi.fn().mockResolvedValue({ _tag: "Success" as const });
    const refreshCloudSessionList = vi.fn();
    const refreshRelayEnvironments = vi.fn();
    mount({
      sessions: [session("s1", "ready")],
      environmentId: ENV,
      cancelSession,
      refreshCloudSessionList,
      refreshRelayEnvironments,
    });

    act(() => {
      captured!.onRegistered("s1", ENV);
    });
    await act(async () => {
      captured!.stopEnvironment(ENV);
    });

    expect(cancelSession).toHaveBeenCalledWith({ environmentId: ENV, input: { sessionId: "s1" } });
    expect(refreshCloudSessionList).toHaveBeenCalled();
    expect(refreshRelayEnvironments).toHaveBeenCalled();
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ type: "success", title: "Stopping that cloud session." }),
    );
    // the in-flight flag clears once the stop settles — it never sticks
    expect(captured!.stoppingEnvironmentId).toBeNull();
  });

  it("does not stop a machine whose session has already ended", async () => {
    const cancelSession = vi.fn().mockResolvedValue({ _tag: "Success" as const });
    mount({
      sessions: [session("s1", "stopped")],
      environmentId: ENV,
      cancelSession,
      refreshCloudSessionList: vi.fn(),
      refreshRelayEnvironments: vi.fn(),
    });

    act(() => {
      captured!.onRegistered("s1", ENV);
    });

    expect(captured!.hasLiveCloudSession(ENV)).toBe(false);
    await act(async () => {
      captured!.stopEnvironment(ENV);
    });
    expect(cancelSession).not.toHaveBeenCalled();
  });
});
