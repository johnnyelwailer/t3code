/**
 * A draft's first message waiting for its cloud session (hive/nx-nexi#417): the thread card
 * with the bind steps, and the sidebar draft row with its Queued status. Both are the production
 * components; the card's steps, elapsed times and bar come from the same
 * `t3team-cloudQueuedSendSteps` module the composer banner and the app read.
 */
import type { Meta, StoryObj } from "@storybook/react";
import type { CloudSession } from "@t3tools/contracts";
import type { CSSProperties } from "react";

import { CloudQueuedSendCard } from "~/cloud/t3team-CloudQueuedSendCard";
import { decodeCloudQueuedSend, type CloudQueuedSend } from "~/cloud/t3team-cloudQueuedSendModel";
import type { CloudQueuedSendStepFacts } from "~/cloud/t3team-cloudQueuedSendSteps";
import { SidebarDraftRow } from "~/components/sidebar/SidebarDraftBlock";
import { DraftId, type ComposerThreadDraftState } from "~/composerDraftStore";

const NOW = Date.now();
const ago = (seconds: number) => new Date(NOW - seconds * 1000).toISOString();

const QUEUED: CloudQueuedSend = decodeCloudQueuedSend({
  messageId: "msg-story",
  messageText: "Run the migration against the staging schema and summarise what changed",
  outgoingText: "Run the migration against the staging schema and summarise what changed",
  titleSeed: "Run the migration against the staging schema",
  modelSelection: { instanceId: "codex", model: "gpt-5" },
  runtimeMode: "full-access",
  interactionMode: "default",
  sessionId: "session-story",
  sessionLabel: "nexi-machine · 4:12 PM",
  createdAt: ago(96),
  stepStartedAt: { queued: ago(96), machine: ago(84) },
})!;

function session(overrides: Partial<CloudSession>): CloudSession {
  return {
    sessionId: "session-story",
    providerKind: "github_actions",
    phase: "preparing",
    elapsedSeconds: 90,
    remainingSeconds: null,
    machineLabel: "ubuntu-slim · 12 GB · 4 cores",
    failureReason: null,
    detailsUrl: null,
    environmentId: "env-cloud-story",
    projectMachine: true,
    ...overrides,
  };
}

function facts(overrides: Partial<CloudQueuedSendStepFacts>): CloudQueuedSendStepFacts {
  return {
    queued: QUEUED,
    session: session({ machineStage: "installing" }),
    machineConnected: false,
    projectReady: false,
    flushing: false,
    ...overrides,
  };
}

const meta = {
  title: "Cloud/QueuedCloudSend",
  component: CloudQueuedSendCard,
  parameters: { layout: "padded" },
  args: { facts: facts({}), onCancel: () => {}, onRetry: null },
} satisfies Meta<typeof CloudQueuedSendCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The machine is being prepared; its live stage ("Installing Nexi") names the step. */
export const MachineStage: Story = {};

/** Up and connected; the project is still syncing onto the machine. */
export const SyncingProject: Story = {
  args: {
    facts: facts({
      session: session({ phase: "ready", elapsedSeconds: 150 }),
      machineConnected: true,
      queued: {
        ...QUEUED,
        stepStartedAt: {
          queued: ago(170),
          machine: ago(160),
          server: ago(40),
          connect: ago(30),
          project: ago(22),
        },
      },
    }),
  },
};

/** The connect failed: the message stays, with Retry and Cancel. */
export const Failed: Story = {
  args: {
    facts: facts({
      session: session({ phase: "ready", elapsedSeconds: 150 }),
      queued: {
        ...QUEUED,
        failureMessage: "The cloud session's relay did not accept the connection.",
        retryable: true,
        stepStartedAt: { queued: ago(170), machine: ago(160), server: ago(40), connect: ago(30) },
      },
    }),
    onRetry: () => {},
  },
};

const SIDEBAR_INSETS = {
  "--sidebar-content-inset": "0.5rem",
  "--sidebar-row-content-inset": "0.625rem",
} as unknown as CSSProperties;

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
      {[QUEUED, { ...QUEUED, messageId: "msg-failed", failureMessage: "relay denied" }].map(
        (queued) => (
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
        ),
      )}
    </ul>
  ),
};
