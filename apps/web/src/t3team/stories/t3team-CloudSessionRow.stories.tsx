import type { Meta, StoryObj } from "@storybook/react";
import type { CloudSession } from "@t3tools/contracts";

import { CloudSessionRow } from "~/components/cloud/t3team-CloudSessionProvisionRow";

const FLEET_MACHINE_LABEL = "ubuntu-slim · 12 GB · 4 cores";
const DETAILS_URL = "https://github.com/hive/nx-nexi/actions/runs/248523362";

function readySession(): CloudSession {
  return {
    providerKind: "github_actions",
    phase: "ready",
    detailsUrl: DETAILS_URL,
    elapsedSeconds: 155,
    remainingSeconds: 4 * 3600 - 155,
    machineLabel: FLEET_MACHINE_LABEL,
    failureReason: null,
  };
}

const meta = {
  title: "Cloud/CloudSessionRow",
  component: CloudSessionRow,
  parameters: { layout: "padded" },
  args: {
    onAction: () => {},
  },
} satisfies Meta<typeof CloudSessionRow>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A ready machine with the stop/delete feature on: Stop, Delete and Connect. */
export const StopAndDelete: Story = {
  args: {
    session: readySession(),
    onSecondaryAction: () => {},
    onDelete: () => {},
  },
};

/** The same row with the stop/delete feature off: only the primary Connect verb. */
export const StopDeleteOff: Story = {
  args: {
    session: readySession(),
  },
};

/** Delete already running: the cluster shows its pending state. */
export const Deleting: Story = {
  args: {
    session: readySession(),
    onSecondaryAction: () => {},
    onDelete: () => {},
    deletePending: true,
  },
};
