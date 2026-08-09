import type { Meta, StoryObj } from "@storybook/react";
import type { ToolAuthState } from "@t3tools/contracts";
import type * as React from "react";

import { ToolAuthCard } from "~/components/settings/t3team-ToolAuthCard";
import { TOOL_AUTH_TOOLS } from "~/components/settings/t3team-toolAuthTools";

const CLAUDE_META = TOOL_AUTH_TOOLS.find((meta) => meta.tool === "claude")!;
const CODEX_META = TOOL_AUTH_TOOLS.find((meta) => meta.tool === "codex")!;

const noop = () => {};
const noopSubmit = (_code: string) => {};

/** Same rounded/bordered "card list" chrome `SettingsSection` wraps cards in. */
function ToolAuthCardFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-[420px] overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-sm/4">
      {children}
    </div>
  );
}

function ToolAuthCardStory(props: {
  state: ToolAuthState | undefined;
  meta?: typeof CLAUDE_META;
  /**
   * A boolean rather than the callback itself: whether the card offers
   * install-and-sign-in is the thing a story wants to vary, and Storybook's
   * args panel can toggle a boolean but not a function.
   */
  onInstall?: boolean;
}) {
  return (
    <ToolAuthCardFrame>
      <ToolAuthCard
        meta={props.meta ?? CLAUDE_META}
        state={props.state}
        onConnect={noop}
        onInstall={props.onInstall ? noop : undefined}
        onSubmitCode={noopSubmit}
        onCancel={noop}
      />
    </ToolAuthCardFrame>
  );
}

const meta = {
  title: "T3Team/Settings/ToolAuthCard",
  component: ToolAuthCardStory,
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof ToolAuthCardStory>;

export default meta;
type Story = StoryObj<typeof meta>;

/** No state has arrived yet (or the tool was never connected): description + Connect. */
export const NotConnected: Story = {
  args: { state: undefined },
};

/**
 * The CLI is missing (the model picker's needs-install case). Passing
 * `onInstall` turns the single action into install-AND-sign-in, rather than a
 * "Connect" that cannot succeed against a binary that isn't there.
 */
export const NotInstalled: Story = {
  args: { state: undefined, onInstall: true, meta: CODEX_META },
};

/**
 * Installing, with the installer's own tail line as progress — a bare spinner
 * for a minute-long `npm install -g` reads as a hang. Sign-in then starts
 * automatically on a successful re-probe; the user clicks nothing else.
 */
export const Installing: Story = {
  args: {
    state: {
      tool: "codex",
      phase: "installing",
      installLog: "npm warn deprecated inflight@1.0.6\nadded 42 packages in 3s\n",
    },
    meta: CODEX_META,
  },
};

/** Process spawned, no sign-in URL yet: spinner only, nothing actionable. */
export const Starting: Story = {
  args: { state: { tool: "claude", phase: "starting" } },
};

/** Claude's paste-back flow: a prominent sign-in link, no device code, no input. */
export const AwaitingOpenClaude: Story = {
  args: {
    state: {
      tool: "claude",
      phase: "awaiting-open",
      url: "https://claude.ai/oauth/authorize?foo=bar",
    },
  },
};

/** Codex's device flow: sign-in link plus a large monospace device code, still no input. */
export const AwaitingOpenCodex: Story = {
  args: {
    state: {
      tool: "codex",
      phase: "awaiting-open",
      url: "https://auth.openai.com/device",
      displayCode: "ABCD-1234",
    },
    meta: CODEX_META,
  },
};

/** Claude only: the human pastes a code back — one auto-focused input, Verify, link stays. */
export const AwaitingCode: Story = {
  args: {
    state: {
      tool: "claude",
      phase: "awaiting-code",
      url: "https://claude.ai/oauth/authorize",
    },
  },
};

/** Code submitted, CLI is checking it. */
export const Verifying: Story = {
  args: { state: { tool: "claude", phase: "verifying" } },
};

/** Signed in, with account/organisation and a far-future expiry — no warning. */
export const Connected: Story = {
  args: {
    state: {
      tool: "claude",
      phase: "connected",
      account: "jane@example.com",
      organization: "Acme Corp",
      expiresAt: Date.now() + 90 * 24 * 60 * 60 * 1000,
    },
  },
};

/**
 * The real, verified `claude auth status --json` shape carries only
 * `authMethod`/`apiProvider` — no account or organisation field at all.
 * Neither must ever be presented as an account (see `connectedSummary` in
 * `ToolAuthCard.tsx`); the card degrades to a plain "Connected" instead of a
 * dangling separator or a misleading "Signed in as claudeai".
 */
export const ConnectedNoAccountInfo: Story = {
  args: {
    state: {
      tool: "claude",
      phase: "connected",
      expiresAt: Date.now() + 90 * 24 * 60 * 60 * 1000,
    },
  },
};

/** Signed in, but the credential expires soon: the pre-expiry warning line. */
export const ConnectedExpiringSoon: Story = {
  args: {
    state: {
      tool: "claude",
      phase: "connected",
      account: "jane@example.com",
      organization: "Acme Corp",
      expiresAt: Date.now() + 2 * 24 * 60 * 60 * 1000,
      message: "Expires in 2 days — reconnect soon.",
    },
  },
};

/** Credential exists but is no longer valid: Expired badge, message, Reconnect. */
export const Expired: Story = {
  args: {
    state: {
      tool: "claude",
      phase: "expired",
      message: "Credential has expired.",
    },
  },
};

/** Sign-in failed: the CLI's own message, verbatim, plus Retry. */
export const Failed: Story = {
  args: {
    state: {
      tool: "claude",
      phase: "failed",
      message: "Login failed: invalid code",
    },
  },
};

const GALLERY_STATES: ReadonlyArray<{
  label: string;
  state: ToolAuthState | undefined;
  meta?: typeof CLAUDE_META;
  /** Renders the install-and-sign-in action instead of a plain "Connect". */
  onInstall?: boolean;
}> = [
  { label: "Not connected", state: undefined },
  {
    label: "Not installed — one click installs AND signs in",
    state: undefined,
    meta: CODEX_META,
    onInstall: true,
  },
  {
    label: "Installing (chains into sign-in automatically)",
    state: {
      tool: "codex",
      phase: "installing",
      installLog: "npm warn deprecated inflight@1.0.6\nadded 42 packages in 3s\n",
    },
    meta: CODEX_META,
  },
  { label: "Starting", state: { tool: "claude", phase: "starting" } },
  {
    label: "Awaiting open — Claude (paste-back)",
    state: {
      tool: "claude",
      phase: "awaiting-open",
      url: "https://claude.ai/oauth/authorize?foo=bar",
    },
  },
  {
    label: "Awaiting open — Codex (device flow)",
    state: {
      tool: "codex",
      phase: "awaiting-open",
      url: "https://auth.openai.com/device",
      displayCode: "ABCD-1234",
    },
    meta: CODEX_META,
  },
  {
    label: "Awaiting code — Claude",
    state: { tool: "claude", phase: "awaiting-code", url: "https://claude.ai/oauth/authorize" },
  },
  { label: "Verifying", state: { tool: "claude", phase: "verifying" } },
  {
    label: "Connected",
    state: {
      tool: "claude",
      phase: "connected",
      account: "jane@example.com",
      organization: "Acme Corp",
      expiresAt: Date.now() + 90 * 24 * 60 * 60 * 1000,
    },
  },
  {
    // The real, verified claude auth status --json shape reports neither —
    // this is the common case, not the exception. Must degrade to a plain
    // "Connected", never "Signed in as <authMethod>".
    label: "Connected — no account info (the real CLI shape)",
    state: {
      tool: "claude",
      phase: "connected",
      expiresAt: Date.now() + 90 * 24 * 60 * 60 * 1000,
    },
  },
  {
    label: "Connected — expiring soon",
    state: {
      tool: "claude",
      phase: "connected",
      account: "jane@example.com",
      organization: "Acme Corp",
      expiresAt: Date.now() + 2 * 24 * 60 * 60 * 1000,
      message: "Expires in 2 days — reconnect soon.",
    },
  },
  {
    label: "Expired",
    state: { tool: "claude", phase: "expired", message: "Credential has expired." },
  },
  {
    label: "Failed",
    state: { tool: "claude", phase: "failed", message: "Login failed: invalid code" },
  },
];

/** Every state stacked vertically with a label, so one screenshot covers the whole card. */
export const Gallery: Story = {
  args: { state: undefined },
  render: () => (
    <div className="flex flex-col gap-4">
      {GALLERY_STATES.map(({ label, state, meta: stateMeta, onInstall }) => (
        <div key={label} className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
            {label}
          </span>
          <ToolAuthCardFrame>
            <ToolAuthCard
              meta={stateMeta ?? CLAUDE_META}
              state={state}
              onConnect={noop}
              onInstall={onInstall ? noop : undefined}
              onSubmitCode={noopSubmit}
              onCancel={noop}
            />
          </ToolAuthCardFrame>
        </div>
      ))}
    </div>
  ),
};
