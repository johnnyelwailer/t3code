import type { Meta, StoryObj } from "@storybook/react";
import { PinIcon } from "lucide-react";
import type { ReactNode } from "react";

import { DEFAULT_RESOLVED_KEYBINDINGS } from "@t3tools/shared/keybindings";

import { RightPanelTabs } from "~/components/RightPanelTabs";
import { ContextChatPaneFrame } from "~/t3team/t3team-ContextChatPaneFrame";

/**
 * My Work's context chat tab: the real `RightPanelTabs` with its pinned Chat tab around the real
 * `ContextChatPaneFrame`. The frame's body is a fixture here: the composer and timeline inside
 * the app are `ChatView`, which needs a connected environment (the browser test
 * `t3team-ContextChatPane.environment.browser.test.tsx` renders the real pane against one).
 */
const noop = () => undefined;

function Bubble(props: { readonly from: "you" | "agent"; readonly children: ReactNode }) {
  return (
    <p
      className={
        props.from === "you"
          ? "ml-auto max-w-[85%] rounded-xl bg-accent px-3 py-1.5 text-sm"
          : "max-w-[90%] text-sm"
      }
    >
      {props.children}
    </p>
  );
}

function Composer() {
  return (
    <div className="mt-auto rounded-2xl border border-border p-3 text-sm text-muted-foreground">
      Ask anything. @ files, $ skills, / commands
    </div>
  );
}

function Tab(props: { readonly body: ReactNode }) {
  return (
    <div className="h-[560px] w-[420px] border border-border bg-background">
      <RightPanelTabs
        mode="embedded"
        keybindings={DEFAULT_RESOLVED_KEYBINDINGS}
        getShortcutContext={() => ({
          terminalFocus: false,
          terminalOpen: false,
          previewFocus: false,
          previewOpen: false,
          isWeb: true,
          isDesktop: false,
        })}
        surfaces={[]}
        environmentId={null}
        activeSurfaceId={null}
        pendingSurfaceIds={new Set()}
        previewSessions={{}}
        desktopByTabId={{}}
        terminalLabelsById={new Map()}
        onActivate={noop}
        onCloseSurface={noop}
        onCloseOtherSurfaces={noop}
        onCloseSurfacesToRight={noop}
        onCloseAllSurfaces={noop}
        onCopyFilePath={noop}
        onAddBrowser={noop}
        onAddBrowserInProfile={noop}
        onAddTerminal={noop}
        onAddDiff={noop}
        onAddFiles={noop}
        onAddPullRequest={noop}
        onAddPullRequests={noop}
        onAddDevice={noop}
        browserAvailable={false}
        terminalAvailable={false}
        diffAvailable={false}
        filesAvailable={false}
        pullRequestAvailable={false}
        pullRequestsAvailable={false}
        deviceAvailable={false}
        pinnedTab={{ label: "Chat", icon: PinIcon, onActivate: noop }}
        emptyState={<ContextChatPaneFrame onNewChat={noop}>{props.body}</ContextChatPaneFrame>}
      >
        {null}
      </RightPanelTabs>
    </div>
  );
}

const meta = {
  title: "T3Team/My Work/Context chat tab",
  component: Tab,
  parameters: { layout: "centered" },
} satisfies Meta<typeof Tab>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: {
    body: (
      <div className="flex min-h-0 flex-1 flex-col p-3">
        <Composer />
      </div>
    ),
  },
};

export const WithConversation: Story = {
  args: {
    body: (
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
        <Bubble from="you">Show me only what is blocked.</Bubble>
        <Bubble from="agent">3 of your 14 items are blocked: ACME-466, ACME-458, ACME-444.</Bubble>
        <Composer />
      </div>
    ),
  },
};
