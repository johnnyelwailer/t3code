/**
 * "Setting up your cloud session": the thread's progress card for a session that is becoming
 * ready. The production component and the production module (`t3team-cloudSessionSetupProgress`)
 * — nothing here forks the wording, the estimate or the motion. Each story freezes the clock
 * (`frozenElapsedSeconds`) so it reads the same every time; the bar still runs its own CSS
 * animation from that reading. Also the sidebar draft row of a draft whose first message waits.
 */
import type { Meta, StoryObj } from "@storybook/react";
import type { CloudSession } from "@t3tools/contracts";
import type { CSSProperties } from "react";

import { CloudSessionSetupCard } from "~/cloud/t3team-CloudSessionSetupCard";
import { decodeCloudQueuedSend, type CloudQueuedSend } from "~/cloud/t3team-cloudQueuedSendModel";
import { SidebarDraftRow } from "~/components/sidebar/SidebarDraftBlock";
import { DraftId, type ComposerThreadDraftState } from "~/composerDraftStore";

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

const QUEUED: CloudQueuedSend | null = decodeCloudQueuedSend({
  messageId: "msg-story",
  messageText: "Run the migration against the staging schema and summarise what changed",
  outgoingText: "Run the migration against the staging schema and summarise what changed",
  titleSeed: "Run the migration against the staging schema",
  modelSelection: { instanceId: "codex", model: "gpt-5" },
  runtimeMode: "full-access",
  interactionMode: "default",
  sessionId: "session-story",
  sessionLabel: "nexi-machine · 4:12 PM",
  createdAt: "2026-10-24T16:12:00.000Z",
});

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

/** A plain session: a rough estimate from one measured start-up, and it says so. */
export const PreparingPlain: Story = {};

/** A project machine: cloning and installing; elapsed time only, an indeterminate bar, no estimate. */
export const PreparingProjectMachine: Story = {
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

/** A first message is waiting; the session is up and this app is opening its connection. */
export const Connecting: Story = {
  args: {
    facts: {
      session: session({ phase: "ready", elapsedSeconds: 84 }),
      machineConnected: false,
      delivery: "queued",
    },
    frozenElapsedSeconds: 84,
  },
};

/** Done, not connected yet: the first message connects. Lingers a moment, then fades out. */
export const Ready: Story = {
  args: {
    facts: { session: session({ phase: "ready", elapsedSeconds: 88 }), machineConnected: false },
    frozenElapsedSeconds: 88,
  },
};

/** Past the rough estimate: no countdown, no fake progress, the step still named. */
export const Slow: Story = {
  args: {
    facts: { session: session({ elapsedSeconds: 210 }), machineConnected: false },
    frozenElapsedSeconds: 210,
  },
};

/** A long project machine setup: elapsed time and a drifting bar, never parked near full. */
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
  args: { motion: "still" },
};

/** Reduced motion on a long setup: no drifting segment, just the track and the words. */
export const ReducedMotionLongWait: Story = {
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

/** A first message waits on a project machine; its live stage ("Installing Nexi") names the step. */
export const FirstMessageMachineStage: Story = {
  args: {
    facts: {
      session: session({ elapsedSeconds: 90, projectMachine: true, machineStage: "installing" }),
      machineConnected: false,
      delivery: "queued",
      queued: QUEUED ?? undefined,
    },
    frozenElapsedSeconds: 90,
    onCancel: () => {},
  },
};

/** Up and connected; the project is still syncing onto the machine. */
export const SyncingProject: Story = {
  args: {
    facts: {
      session: session({ phase: "ready", elapsedSeconds: 150 }),
      machineConnected: true,
      projectReady: false,
      delivery: "queued",
      queued: QUEUED ?? undefined,
    },
    frozenElapsedSeconds: 150,
    onCancel: () => {},
  },
};

const SIDEBAR_INSETS: CSSProperties &
  Record<"--sidebar-content-inset" | "--sidebar-row-content-inset", string> = {
  "--sidebar-content-inset": "0.5rem",
  "--sidebar-row-content-inset": "0.625rem",
};

function composer(queued: CloudQueuedSend): ComposerThreadDraftState {
  return {
    prompt: "",
    images: [],
    files: [],
    nonPersistedImageIds: [],
    persistedAttachments: [],
    terminalContexts: [],
    previewAnnotations: [],
    reviewComments: [],
    threadContexts: [],
    modelSelectionByProvider: {},
    activeProvider: null,
    runtimeMode: null,
    interactionMode: null,
    cloudQueuedSend: queued,
  };
}

/** The draft keeps its sidebar row while it waits, previewing the queued message. */
export const SidebarQueuedRow: Story = {
  render: () => (
    <ul className="w-72 bg-sidebar p-1" style={SIDEBAR_INSETS}>
      {(QUEUED === null
        ? []
        : [QUEUED, { ...QUEUED, messageId: "msg-failed", failureMessage: "relay denied" }]
      ).map((queued) => (
        <SidebarDraftRow
          key={queued.messageId}
          draftId={DraftId.make(`draft-${queued.messageId}`)}
          composer={composer(queued)}
          project={null}
          projectDisplayName="nexi-work"
          isActive={false}
          onNavigate={() => {}}
          onDiscard={() => {}}
          onContextMenu={() => {}}
        />
      ))}
    </ul>
  ),
};
