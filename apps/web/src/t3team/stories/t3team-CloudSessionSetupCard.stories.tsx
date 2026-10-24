/**
 * "Setting up your cloud session": the thread's progress card for a session that is becoming
 * ready. The production component and the production module (`t3team-cloudSessionSetupProgress`)
 * — nothing here forks the wording, the estimate or the motion. Each story freezes the clock
 * (`frozenElapsedSeconds`) so it reads the same every time; the bar still runs its own CSS
 * animation from that reading.
 */
import type { Meta, StoryObj } from "@storybook/react";
import type { CloudSession, CloudSessionTiming } from "@t3tools/contracts";

import { CloudSessionSetupCard } from "~/cloud/t3team-CloudSessionSetupCard";

function session(overrides: Partial<CloudSession>): CloudSession {
  return {
    sessionId: "session-story",
    providerKind: "github_actions",
    phase: "preparing",
    elapsedSeconds: 38,
    remainingSeconds: null,
    machineLabel: "ubuntu-slim · 12 GB · 4 cores",
    failureReason: null,
    detailsUrl: null,
    ...overrides,
  };
}

const PROJECT_HISTORY: CloudSessionTiming = {
  samples: 5,
  scope: "project",
  readyLowSeconds: 170,
  readyTypicalSeconds: 240,
  readyHighSeconds: 330,
  startsAtSeconds: { preparing: 12, building: 50, checking: 170, installing: 190, starting: 215 },
};

const meta = {
  title: "Cloud/CloudSessionSetupCard",
  component: CloudSessionSetupCard,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div className="mx-auto w-full max-w-[44rem] px-2 pt-6">
        <Story />
      </div>
    ),
  ],
  args: {
    facts: { session: session({}), machineConnected: false },
    frozenElapsedSeconds: 38,
  },
} satisfies Meta<typeof CloudSessionSetupCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The create request is out; no session record exists yet. */
export const Creating: Story = {
  args: { facts: { session: null, machineConnected: false }, frozenElapsedSeconds: 2 },
};

/** Waiting for a free machine. */
export const Queued: Story = {
  args: {
    facts: { session: session({ phase: "queued", elapsedSeconds: 7 }), machineConnected: false },
    frozenElapsedSeconds: 7,
  },
};

/** A plain session: about a minute and a half, no repository work. */
export const PreparingPlain: Story = {};

/** A project machine with no history yet: cloning and installing; says so, with a wide range. */
export const PreparingProjectMachineCold: Story = {
  args: {
    facts: {
      session: session({
        elapsedSeconds: 118,
        projectMachine: true,
        machineStage: "building",
        name: "nx-nexi",
      }),
      machineConnected: false,
    },
    frozenElapsedSeconds: 118,
  },
};

/** The same project once earlier sessions exist: a tighter range, from the user's own runs. */
export const PreparingProjectMachineWithHistory: Story = {
  args: {
    facts: {
      session: session({
        elapsedSeconds: 118,
        projectMachine: true,
        machineStage: "building",
        name: "nx-nexi",
        timing: PROJECT_HISTORY,
      }),
      machineConnected: false,
    },
    frozenElapsedSeconds: 118,
  },
};

/** The first message was already typed: the card says it waits and offers Cancel. */
export const FirstMessageWaiting: Story = {
  args: {
    facts: {
      session: session({ phase: "starting", elapsedSeconds: 66 }),
      machineConnected: false,
      delivery: "queued",
    },
    frozenElapsedSeconds: 66,
    onCancel: () => {},
  },
};

/** Up on the fleet; this app is opening its connection. */
export const Connecting: Story = {
  args: {
    facts: { session: session({ phase: "ready", elapsedSeconds: 84 }), machineConnected: false },
    frozenElapsedSeconds: 84,
  },
};

/** Done: the card says so, lingers a moment, then fades out (watch it in the canvas). */
export const Ready: Story = {
  args: {
    facts: { session: session({ phase: "ready", elapsedSeconds: 88 }), machineConnected: true },
    frozenElapsedSeconds: 88,
  },
};

/** Past the slow end of the range: no countdown, no fake progress, the step still named. */
export const Slow: Story = {
  args: {
    facts: { session: session({ elapsedSeconds: 210 }), machineConnected: false },
    frozenElapsedSeconds: 210,
  },
};

/** A project machine that is taking longer than even its wide range. */
export const SlowProjectMachine: Story = {
  args: {
    facts: {
      session: session({
        elapsedSeconds: 1000,
        projectMachine: true,
        machineStage: "installing",
      }),
      machineConnected: false,
    },
    frozenElapsedSeconds: 1000,
  },
};

/** Failed: the reason in words, Try again, and where to look. */
export const Failed: Story = {
  args: {
    facts: {
      session: session({
        phase: "failed",
        elapsedSeconds: 150,
        failureReason: "Failed at “Install dependencies and build”.",
        detailsUrl: "https://github.com/hive/nx-nexi/actions/runs/348514897",
      }),
      machineConnected: false,
    },
    onTryAgain: () => {},
  },
};

/** The session is up but the waiting message could not be delivered. */
export const MessageNotDelivered: Story = {
  args: {
    facts: {
      session: session({ phase: "ready", elapsedSeconds: 120 }),
      machineConnected: true,
      delivery: "queued",
      sendFailure: "The cloud session did not accept the connection.",
    },
    onRetry: () => {},
    onCancel: () => {},
  },
};

/** `prefers-reduced-motion`: no loops, no shimmer, no ripples; the bar moves forward each second. */
export const ReducedMotion: Story = {
  args: {
    facts: {
      session: session({
        elapsedSeconds: 118,
        projectMachine: true,
        machineStage: "building",
      }),
      machineConnected: false,
    },
    frozenElapsedSeconds: 118,
    motion: "still",
  },
};
