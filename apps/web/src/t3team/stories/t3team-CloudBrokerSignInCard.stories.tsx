import type { Meta, StoryObj } from "@storybook/react";
import type { CloudBrokerStatus, CloudSession } from "@t3tools/contracts";

import { CloudBrokerSignInCard } from "~/components/cloud/t3team-CloudBrokerSignInCard";
import {
  CloudSessionProvisionPanel,
  DEFAULT_CLOUD_SESSION_DURATION_SECONDS,
} from "~/components/cloud/t3team-CloudSessionProvisionPanel";

/** The Nexplore sign-in cloud sessions need when they run over the Nexi broker. */

const status = (
  auth: CloudBrokerStatus["auth"],
  lastError: string | null = null,
): CloudBrokerStatus => ({
  enabled: true,
  auth,
  lastError,
});

const meta = {
  title: "Cloud/CloudBrokerSignInCard",
  component: CloudBrokerSignInCard,
  parameters: { layout: "padded" },
  args: {
    status: status({ _tag: "SignedOut" }),
    onSignIn: () => {},
    onSignOut: () => {},
    onOpenVerification: () => {},
  },
} satisfies Meta<typeof CloudBrokerSignInCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SignedOut: Story = {};

export const Starting: Story = { args: { pending: true } };

export const WaitingForCode: Story = {
  args: {
    status: status({
      _tag: "SigningIn",
      userCode: "LD5PUZ45H",
      verificationUri: "https://login.microsoft.com/device",
      expiresAtMs: Date.now() + 900_000,
    }),
  },
};

export const CodeExpired: Story = {
  args: { status: status({ _tag: "SignedOut" }, "The sign-in code expired. Start again.") },
};

export const ServerUnreachable: Story = {
  args: { error: "Could not reach this machine's server: TypeError: Failed to fetch" },
};

export const SignedIn: Story = {
  args: { status: status({ _tag: "SignedIn", name: "Philip Jonientz" }) },
};

/** No broker configured on this build: the card renders nothing and the panel is unchanged. */
export const NoBrokerConfigured: Story = {
  args: { status: { enabled: false, auth: { _tag: "SignedOut" }, lastError: null } },
};

const readySession: CloudSession = {
  sessionId: "290877467",
  providerKind: "github_actions",
  phase: "ready",
  elapsedSeconds: 240,
  remainingSeconds: null,
  machineLabel: "ubuntu-slim · 12 GB · 4 cores",
  failureReason: null,
  detailsUrl: null,
  environmentId: "5291a715-cca8-47f1-91c4-e0a556891d47",
  transport: "nexi_broker",
};

/** In place: the card sits in the real panel's banner slot, above the session rows. */
export const InTheProvisionPanel: StoryObj<typeof CloudSessionProvisionPanel> = {
  render: () => (
    <CloudSessionProvisionPanel
      sessions={[readySession]}
      durationSeconds={DEFAULT_CLOUD_SESSION_DURATION_SECONDS}
      onCreate={() => {}}
      onSessionAction={() => {}}
      banner={
        <CloudBrokerSignInCard
          status={status({ _tag: "SignedIn", name: "Philip Jonientz" })}
          onSignIn={() => {}}
          onSignOut={() => {}}
          onOpenVerification={() => {}}
        />
      }
    />
  ),
};
