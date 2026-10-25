import { EnvironmentId, type CloudSession } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import { act, fakeTimers, render } from "../../test/render";
import { classifyCloudProjectWait } from "./t3team-cloudProjectWait";
import { cloudProjectWaitSeconds } from "./t3team-cloudProjectWaitClock";
import { decodeCloudQueuedSend, type CloudQueuedSend } from "./t3team-cloudQueuedSendModel";
import type { CloudQueuedSendStepFacts } from "./t3team-cloudQueuedSendSteps";
import {
  useCloudProjectWaitNow,
  useCloudQueuedSendProjectWaitNow,
} from "./t3team-useCloudProjectWaitNow";

/** The probes render no router links and read no route, so they mount without a router. */
const noRouter: { readonly router: false } = { router: false };

const NOW = Date.parse("2026-10-24T12:00:00.000Z");

function queuedStampedAgo(seconds: number): CloudQueuedSend | undefined {
  return (
    decodeCloudQueuedSend({
      messageId: "msg-1",
      messageText: "hi",
      outgoingText: "hi",
      titleSeed: "hi",
      modelSelection: { instanceId: "codex", model: "gpt-5" },
      runtimeMode: "full-access",
      interactionMode: "default",
      sessionId: "session-1",
      sessionLabel: "machine",
      createdAt: new Date(NOW - seconds * 1000).toISOString(),
      stepStartedAt: { project: new Date(NOW - seconds * 1000).toISOString() },
    }) ?? undefined
  );
}

const readySession: CloudSession = {
  sessionId: "session-1",
  providerKind: "github_actions",
  phase: "ready",
  elapsedSeconds: 600,
  remainingSeconds: null,
  machineLabel: "machine",
  failureReason: null,
  detailsUrl: null,
  environmentId: "env-cloud",
};

function stepFacts(queued: CloudQueuedSend, projectReady: boolean): CloudQueuedSendStepFacts {
  return {
    queued,
    session: readySession,
    machineConnected: true,
    projectReady,
    projectWait: classifyCloudProjectWait({
      environmentId: EnvironmentId.make("env-cloud"),
      scratch: false,
      machineSettingsLoaded: true,
      expectedCwd: "/workspace/app",
      scratchRoot: null,
      composer: null,
      projects: [],
    }),
    flushing: false,
  };
}

function WaitProbe(props: {
  readonly queued: CloudQueuedSend | undefined;
  readonly pending: boolean;
  readonly onRender: () => void;
}) {
  props.onRender();
  const nowMs = useCloudProjectWaitNow(props.queued, props.pending);
  return <span>{cloudProjectWaitSeconds(props.queued, nowMs)}</span>;
}

function BannerProbe(props: {
  readonly facts: CloudQueuedSendStepFacts | null;
  readonly onRender: () => void;
}) {
  props.onRender();
  const nowMs = useCloudQueuedSendProjectWaitNow(props.facts);
  return (
    <span>{props.facts === null ? "-" : cloudProjectWaitSeconds(props.facts.queued, nowMs)}</span>
  );
}

describe("useCloudProjectWaitNow", () => {
  it("re-renders only at the expected and slow points while the step is pending", async () => {
    using _timers = fakeTimers({ now: NOW });
    const renders = vi.fn();
    const queued = queuedStampedAgo(1);
    await using screen = await render(
      <WaitProbe queued={queued} pending onRender={renders} />,
      noRouter,
    );
    const mounted = renders.mock.calls.length;
    await act(() => vi.advanceTimersByTime(13_000));
    expect(renders.mock.calls.length).toBe(mounted);
    await act(() => vi.advanceTimersByTime(1_000));
    expect(screen.container.textContent).toBe("15");
    await act(() => vi.advanceTimersByTime(75_000));
    expect(screen.container.textContent).toBe("90");
    const atSlow = renders.mock.calls.length;
    await act(() => vi.advanceTimersByTime(600_000));
    expect(renders.mock.calls.length).toBe(atSlow);
  });

  it("arms nothing off the step, and clears its timer when the step completes", async () => {
    using _timers = fakeTimers({ now: NOW });
    const renders = vi.fn();
    const queued = queuedStampedAgo(1);
    await using screen = await render(
      <WaitProbe queued={queued} pending onRender={renders} />,
      noRouter,
    );
    await screen.rerender(<WaitProbe queued={queued} pending={false} onRender={renders} />);
    const afterStepChange = renders.mock.calls.length;
    await act(() => vi.advanceTimersByTime(120_000));
    expect(renders.mock.calls.length).toBe(afterStepChange);
  });

  it("leaves no timer behind when it unmounts mid-wait", async () => {
    using _timers = fakeTimers({ now: NOW });
    const before = vi.getTimerCount();
    {
      await using _screen = await render(
        <WaitProbe queued={queuedStampedAgo(1)} pending onRender={() => {}} />,
        noRouter,
      );
      expect(vi.getTimerCount()).toBeGreaterThan(before);
    }
    expect(vi.getTimerCount()).toBe(before);
  });
});

describe("useCloudQueuedSendProjectWaitNow", () => {
  it("escalates the banner while the send waits on the project step", async () => {
    using _timers = fakeTimers({ now: NOW });
    const queued = queuedStampedAgo(5);
    if (queued === undefined) throw new Error("fixture did not decode");
    await using screen = await render(
      <BannerProbe facts={stepFacts(queued, false)} onRender={() => {}} />,
      noRouter,
    );
    await act(() => vi.advanceTimersByTime(10_000));
    expect(screen.container.textContent).toBe("15");
    await act(() => vi.advanceTimersByTime(75_000));
    expect(screen.container.textContent).toBe("90");
  });

  it("arms nothing once the project is ready or nothing is queued", async () => {
    using _timers = fakeTimers({ now: NOW });
    const queued = queuedStampedAgo(5);
    if (queued === undefined) throw new Error("fixture did not decode");
    const renders = vi.fn();
    await using screen = await render(
      <BannerProbe facts={stepFacts(queued, false)} onRender={renders} />,
      noRouter,
    );
    await screen.rerender(<BannerProbe facts={stepFacts(queued, true)} onRender={renders} />);
    const afterReady = renders.mock.calls.length;
    await act(() => vi.advanceTimersByTime(120_000));
    expect(renders.mock.calls.length).toBe(afterReady);
    await screen.rerender(<BannerProbe facts={null} onRender={renders} />);
    const afterCleared = renders.mock.calls.length;
    await act(() => vi.advanceTimersByTime(120_000));
    expect(renders.mock.calls.length).toBe(afterCleared);
  });
});
