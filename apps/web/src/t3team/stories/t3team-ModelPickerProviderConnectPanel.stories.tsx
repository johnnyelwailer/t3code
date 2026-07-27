import type { Meta, StoryObj } from "@storybook/react";
import { ProviderDriverKind, ProviderInstanceId, type ServerProvider } from "@t3tools/contracts";
import type * as React from "react";

import { ModelPickerProviderConnectPanel } from "~/components/chat/t3team-ModelPickerProviderConnectPanel";
import { deriveProviderInstanceEntries } from "~/providerInstances";

function provider(input: {
  driverKind: ProviderDriverKind;
  instanceId: string;
  displayName: string;
  installed?: boolean;
}): ServerProvider {
  return {
    instanceId: ProviderInstanceId.make(input.instanceId),
    driver: input.driverKind,
    displayName: input.displayName,
    enabled: true,
    installed: input.installed ?? true,
    version: null,
    status: "error",
    auth: { status: "unknown" },
    checkedAt: "2026-01-01T00:00:00.000Z",
    models: [],
    slashCommands: [],
    skills: [],
  };
}

const CLAUDE_ENTRY = deriveProviderInstanceEntries([
  provider({ driverKind: ProviderDriverKind.make("claudeAgent"), instanceId: "claudeAgent", displayName: "Claude Code" }),
])[0]!;

const CODEX_NOT_INSTALLED_ENTRY = deriveProviderInstanceEntries([
  provider({
    driverKind: ProviderDriverKind.make("codex"),
    instanceId: "codex",
    displayName: "Codex",
    installed: false,
  }),
])[0]!;

const CLAUDE_NOT_INSTALLED_ENTRY = deriveProviderInstanceEntries([
  provider({
    driverKind: ProviderDriverKind.make("claudeAgent"),
    instanceId: "claudeAgent",
    displayName: "Claude Code",
    installed: false,
  }),
])[0]!;

/**
 * Mirrors the picker's actual content column: `w-screen max-w-100` popover
 * minus the `w-12` sidebar, on the same `bg-muted/40` the model list area
 * uses. This is the area `ModelPickerProviderConnectPanel` renders into
 * instead of the model list — not a settings pane, so the frame is
 * intentionally narrow.
 */
function PickerListAreaFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-96 w-[352px] flex-col overflow-hidden rounded-r-lg border border-l-0 bg-muted/40">
      {children}
    </div>
  );
}

function ConnectPanelStory(
  props: React.ComponentProps<typeof ModelPickerProviderConnectPanel>,
) {
  return (
    <PickerListAreaFrame>
      <ModelPickerProviderConnectPanel {...props} />
    </PickerListAreaFrame>
  );
}

const meta = {
  title: "T3Team/Settings/ModelPickerProviderConnectPanel",
  component: ConnectPanelStory,
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof ConnectPanelStory>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Claude selected in the picker sidebar, installed but not authenticated
 * (or auth status unknown — see the critical subtlety on
 * `resolveProviderInstanceReadiness`). No live environment is connected in
 * Storybook, so the card renders its `idle` state — same as a user who has
 * never connected this tool.
 */
export const NeedsAuth: Story = {
  args: { entry: CLAUDE_ENTRY, tool: "claude", readiness: "needsAuth" },
};

/** Codex selected, not installed in this sandbox — informational only, no install command fabricated. */
export const NeedsInstallCodex: Story = {
  args: { entry: CODEX_NOT_INSTALLED_ENTRY, tool: "codex", readiness: "needsInstall" },
};

/** Claude selected, not installed in this sandbox. */
export const NeedsInstallClaude: Story = {
  args: { entry: CLAUDE_NOT_INSTALLED_ENTRY, tool: "claude", readiness: "needsInstall" },
};

const GALLERY_STATES: ReadonlyArray<{
  label: string;
  props: React.ComponentProps<typeof ModelPickerProviderConnectPanel>;
}> = [
  { label: "Needs auth — Claude", props: { entry: CLAUDE_ENTRY, tool: "claude", readiness: "needsAuth" } },
  {
    label: "Needs install — Codex",
    props: { entry: CODEX_NOT_INSTALLED_ENTRY, tool: "codex", readiness: "needsInstall" },
  },
  {
    label: "Needs install — Claude",
    props: { entry: CLAUDE_NOT_INSTALLED_ENTRY, tool: "claude", readiness: "needsInstall" },
  },
];

/** Every state stacked with a label, so one screenshot covers the whole panel. */
export const Gallery: Story = {
  args: { entry: CLAUDE_ENTRY, tool: "claude", readiness: "needsAuth" },
  render: () => (
    <div className="flex flex-col gap-4">
      {GALLERY_STATES.map(({ label, props }) => (
        <div key={label} className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
            {label}
          </span>
          <PickerListAreaFrame>
            <ModelPickerProviderConnectPanel {...props} />
          </PickerListAreaFrame>
        </div>
      ))}
    </div>
  ),
};
