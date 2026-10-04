import type { Meta, StoryObj } from "@storybook/react";
import type { CloudSession } from "@t3tools/contracts";
import { useCallback, useEffect, useState } from "react";

import {
  CloudSessionProvisionPanel,
  DEFAULT_CLOUD_SESSION_DURATION_SECONDS,
} from "~/components/cloud/t3team-CloudSessionProvisionPanel";
import type { CloudSessionProvisionPhase } from "~/components/cloud/t3team-cloudSessionProvisionPresentation";

const FLEET_MACHINE_LABEL = "ubuntu-slim · 12 GB · 4 cores";
const DETAILS_URL = "https://github.com/hive/nx-nexi/actions/runs/248523362";

function session(overrides: Partial<CloudSession> & { sessionId: string }): CloudSession {
  return {
    providerKind: "github_actions",
    phase: "ready",
    detailsUrl: null,
    elapsedSeconds: 0,
    remainingSeconds: null,
    machineLabel: FLEET_MACHINE_LABEL,
    failureReason: null,
    ...overrides,
  };
}

const meta = {
  title: "Cloud/CloudSessionProvisionPanel",
  component: CloudSessionProvisionPanel,
  parameters: { layout: "padded" },
  args: {
    onCreate: () => {},
    onSessionAction: () => {},
    durationSeconds: DEFAULT_CLOUD_SESSION_DURATION_SECONDS,
  },
} satisfies Meta<typeof CloudSessionProvisionPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** First run: nothing provisioned, one button to press. */
export const Empty: Story = {
  args: { sessions: [] },
};

export const Loading: Story = {
  args: { sessions: [], loading: true },
};

/** Every phase at once, so the wording and tones can be compared side by side. */
export const AllPhases: Story = {
  args: {
    sessions: [
      session({ sessionId: "s-requested", phase: "requested", elapsedSeconds: 2 }),
      session({ sessionId: "s-queued", phase: "queued", elapsedSeconds: 9 }),
      session({ sessionId: "s-preparing", phase: "preparing", elapsedSeconds: 74 }),
      session({ sessionId: "s-starting", phase: "starting", elapsedSeconds: 141 }),
      session({
        sessionId: "s-ready",
        phase: "ready",
        detailsUrl: DETAILS_URL,
        elapsedSeconds: 155,
        remainingSeconds: 4 * 3600 - 155,
      }),
      session({
        sessionId: "s-failed",
        phase: "failed",
        elapsedSeconds: 128,
        failureReason: "Build step exited 1: could not locate the t3code fork.",
      }),
      session({ sessionId: "s-stopped", phase: "stopped", elapsedSeconds: 4 * 3600 }),
    ],
  },
};

/** The only state that offers a Connect action. */
export const Ready: Story = {
  args: {
    sessions: [
      session({
        sessionId: "s-ready",
        phase: "ready",
        detailsUrl: DETAILS_URL,
        elapsedSeconds: 155,
        remainingSeconds: 4 * 3600 - 155,
      }),
    ],
  },
};

export const Failed: Story = {
  args: {
    sessions: [
      session({
        sessionId: "s-failed",
        phase: "failed",
        elapsedSeconds: 128,
        failureReason: "Build step exited 1: could not locate the t3code fork.",
      }),
    ],
  },
};

const LIFECYCLE: ReadonlyArray<{
  readonly phase: CloudSessionProvisionPhase;
  readonly untilSeconds: number;
}> = [
  { phase: "requested", untilSeconds: 4 },
  { phase: "queued", untilSeconds: 14 },
  { phase: "preparing", untilSeconds: 135 },
  { phase: "starting", untilSeconds: 145 },
  { phase: "ready", untilSeconds: Number.POSITIVE_INFINITY },
];

/**
 * The real thing, replayed at 20× against the measured timings of run
 * 248523362 — press "New session" and watch it walk to Ready in ~8 seconds.
 * This is the story to look at when judging whether the progress and the
 * wording actually feel right; the static ones only prove the states render.
 */
export const LiveLifecycle: Story = {
  args: { sessions: [] },
  render: function LiveLifecycleStory() {
    const [elapsed, setElapsed] = useState<number | null>(null);
    const [durationSeconds, setDurationSeconds] = useState(DEFAULT_CLOUD_SESSION_DURATION_SECONDS);

    useEffect(() => {
      if (elapsed === null) return;
      const timer = window.setInterval(() => {
        setElapsed((previous) => (previous === null ? null : previous + 5));
      }, 250);
      return () => window.clearInterval(timer);
    }, [elapsed === null]);

    const handleCreate = useCallback(() => setElapsed(0), []);
    const handleAction = useCallback((current: CloudSession) => {
      if (current.phase === "ready") return;
      setElapsed(null);
    }, []);

    const phase =
      elapsed === null
        ? null
        : (LIFECYCLE.find((step) => elapsed < step.untilSeconds)?.phase ?? "ready");

    return (
      <CloudSessionProvisionPanel
        sessions={
          elapsed === null || phase === null
            ? []
            : [
                session({
                  sessionId: "s-live",
                  phase,
                  elapsedSeconds: elapsed,
                  detailsUrl: phase === "ready" ? DETAILS_URL : null,
                  remainingSeconds: phase === "ready" ? durationSeconds - elapsed : null,
                }),
              ]
        }
        durationSeconds={durationSeconds}
        onDurationChange={setDurationSeconds}
        createPending={elapsed !== null && phase !== "ready"}
        onCreate={handleCreate}
        onSessionAction={handleAction}
      />
    );
  },
};
