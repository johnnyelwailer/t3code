import { sessionEndedError } from "@t3tools/client-runtime/connection";
import { EnvironmentId } from "@t3tools/contracts";
import { AsyncResult, Atom } from "effect/reactivity";
import { describe, expect, it, vi } from "vite-plus/test";

import { act, fakeTimers, render } from "../../test/render";

interface LiveStateMock {
  environment: string;
  phase: string;
  supervisorState: unknown;
}

const state = vi.hoisted((): LiveStateMock => ({
  environment: "",
  phase: "connected",
  supervisorState: { phase: "available", lastFailure: null },
}));

vi.mock("~/state/presentation", () => ({
  useEnvironmentPresentation: () => ({
    isReady: true,
    presentation: {
      connection: { phase: state.phase, error: null, traceId: null },
      entry: { target: { _tag: "BrokerConnectionTarget" } },
    },
  }),
}));
vi.mock("~/connection/catalog", () => ({
  environmentCatalog: {
    stateAtom: () => Atom.make(AsyncResult.success(state.supervisorState)),
  },
}));

const { useEnvironmentLiveState } = await import("./t3team-useEnvironmentLiveState");

function Probe() {
  return <span>{useEnvironmentLiveState(EnvironmentId.make(state.environment))}</span>;
}

function setup(next: { readonly phase: string; readonly state?: unknown }) {
  state.phase = next.phase;
  state.supervisorState = next.state ?? { phase: "available", lastFailure: null };
  state.environment = `env-cloud-${expect.getState().currentTestName ?? ""}`;
}

describe("useEnvironmentLiveState", () => {
  it("is live while connected", async () => {
    setup({ phase: "connected" });
    await using screen = await render(<Probe />, { router: false });
    expect(screen.container.textContent).toBe("live");
  });

  it("stays live through a short reconnect, then goes offline after the grace", async () => {
    using _timers = fakeTimers();
    setup({ phase: "reconnecting" });
    await using screen = await render(<Probe />, { router: false });
    expect(screen.container.textContent).toBe("live");
    await act(() => vi.advanceTimersByTime(2_500));
    expect(screen.container.textContent).toBe("offline");
  });

  it("is ended when the supervisor parked the connection on an ended session", async () => {
    setup({
      phase: "error",
      state: { phase: "blocked", lastFailure: sessionEndedError("gone") },
    });
    await using screen = await render(<Probe />, { router: false });
    expect(screen.container.textContent).toBe("ended");
  });

  it("is offline, not ended, for any other connection failure", async () => {
    setup({ phase: "error", state: { phase: "blocked", lastFailure: null } });
    await using screen = await render(<Probe />, { router: false });
    expect(screen.container.textContent).toBe("offline");
  });

  it("resumes live when the connection returns", async () => {
    using _timers = fakeTimers();
    setup({ phase: "reconnecting" });
    await using screen = await render(<Probe />, { router: false });
    await act(() => vi.advanceTimersByTime(2_500));
    expect(screen.container.textContent).toBe("offline");
    state.phase = "connected";
    await screen.rerender(<Probe />);
    expect(screen.container.textContent).toBe("live");
  });
});
