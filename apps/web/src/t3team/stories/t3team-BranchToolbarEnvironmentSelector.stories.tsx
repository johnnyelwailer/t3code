import type { Meta, StoryObj } from "@storybook/react";
import type { EnvironmentId, ProjectId } from "@t3tools/contracts";

import { BranchToolbarEnvironmentSelector } from "~/components/BranchToolbarEnvironmentSelector";
import type { EnvironmentOption } from "~/components/BranchToolbar.logic";
import type { CloudSession } from "~/components/cloud/cloudSessionProvisionPresentation";

/**
 * The "Run on" picker in the composer context strip — the quickest place to
 * start a cloud session, because it is already where you choose a machine right
 * before starting a conversation.
 *
 * Open the dropdown to see the change: everything above the separator is
 * exactly what shipped before; the "Cloud" group is new and appears only when
 * `onCreateCloudSession` is supplied.
 */
function environment(
  id: string,
  label: string,
  machine: EnvironmentOption["machine"],
  isPrimary = false,
): EnvironmentOption {
  return {
    environmentId: id as EnvironmentId,
    projectId: "project-story" as ProjectId,
    label,
    isPrimary,
    machine,
  };
}

function cloudSession(overrides: Partial<CloudSession> & { sessionId: string }): CloudSession {
  return {
    providerKind: "github_actions",
    phase: "preparing",
    environmentId: null,
    elapsedSeconds: 74,
    remainingSeconds: null,
    machineLabel: "ubuntu-slim · 12 GB · 4 cores",
    failureReason: null,
    ...overrides,
  };
}

const ENVIRONMENTS = [
  environment("env-local", "MacBook Pro", "laptop", true),
  environment("env-studio", "Mac Studio", "mac-studio"),
];

const meta = {
  title: "Cloud/BranchToolbarEnvironmentSelector",
  component: BranchToolbarEnvironmentSelector,
  parameters: { layout: "centered" },
  args: {
    envLocked: false,
    environmentId: "env-local" as EnvironmentId,
    availableEnvironments: ENVIRONMENTS,
    onEnvironmentChange: () => {},
  },
} satisfies Meta<typeof BranchToolbarEnvironmentSelector>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Today's menu. No cloud group — proof the change is inert without the prop. */
export const Unchanged: Story = {};

/** With the action item, nothing provisioning yet. */
export const WithCloudAction: Story = {
  args: { onCreateCloudSession: () => {} },
};

/** One session mid-build, shown read-only above the action. */
export const CloudSessionStarting: Story = {
  args: {
    onCreateCloudSession: () => {},
    pendingCloudSessions: [cloudSession({ sessionId: "s-live" })],
  },
};

/** Two in flight at once — the horizontal-scaling case. */
export const SeveralStarting: Story = {
  args: {
    onCreateCloudSession: () => {},
    pendingCloudSessions: [
      cloudSession({ sessionId: "s-1", phase: "queued", elapsedSeconds: 9 }),
      cloudSession({ sessionId: "s-2", phase: "starting", elapsedSeconds: 141 }),
    ],
  },
};

/** Auto balance present too, so the full menu can be judged at once. */
export const FullMenu: Story = {
  args: {
    autoEnvironmentLabel: "Auto balance",
    onAutoEnvironment: () => {},
    onCreateCloudSession: () => {},
    pendingCloudSessions: [cloudSession({ sessionId: "s-live" })],
  },
};
