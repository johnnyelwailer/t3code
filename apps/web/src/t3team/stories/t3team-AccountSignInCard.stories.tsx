import type { Meta, StoryObj } from "@storybook/react";
import type { AccountStatus, CloudSession } from "@t3tools/contracts";

import { AccountSignInCard } from "~/components/account/t3team-AccountSignInCard";
import { CloudSessionProvisionPanel } from "~/components/cloud/t3team-CloudSessionProvisionPanel";

/** The account sign-in a feature asks for where it needs one; here, cloud sessions. */

const account = (auth: AccountStatus["auth"], lastError: string | null = null): AccountStatus => ({
  id: "acme",
  label: "Acme",
  auth,
  lastError,
});

const meta = {
  title: "Account/AccountSignInCard",
  component: AccountSignInCard,
  parameters: { layout: "padded" },
  args: {
    account: account({ _tag: "SignedOut" }),
    purpose: "to use cloud sessions",
    onSignIn: () => {},
    onOpenVerification: () => {},
  },
} satisfies Meta<typeof AccountSignInCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SignedOut: Story = {};

export const Starting: Story = { args: { pending: true } };

export const WaitingForCode: Story = {
  args: {
    account: account({
      _tag: "SigningIn",
      userCode: "LD5PUZ45H",
      verificationUri: "https://id.example.com/device",
      expiresAtMs: Date.now() + 900_000,
    }),
  },
};

/** An issuer without a device code: the browser is the only way in. */
export const WaitingForBrowser: Story = {
  args: {
    account: account({
      _tag: "SigningIn",
      userCode: null,
      verificationUri: null,
      expiresAtMs: Date.now() + 600_000,
    }),
  },
};

export const CodeExpired: Story = {
  args: { account: account({ _tag: "SignedOut" }, "The sign-in code expired. Start again.") },
};

export const ServerUnreachable: Story = {
  args: { error: "Could not reach this machine's server: TypeError: Failed to fetch" },
};

/** Signed in: nothing to ask for here; the account lives in the app's account entry. */
export const SignedIn: Story = {
  args: { account: account({ _tag: "SignedIn", name: "Philip Jonientz" }) },
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
      onCreate={() => {}}
      onSessionAction={() => {}}
      banner={
        <AccountSignInCard
          account={account({ _tag: "SignedOut" })}
          purpose="to use cloud sessions"
          onSignIn={() => {}}
          onOpenVerification={() => {}}
        />
      }
    />
  ),
};
