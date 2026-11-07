import type { Meta, StoryObj } from "@storybook/react";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { DEFAULT_RESOLVED_KEYBINDINGS } from "@t3tools/shared/keybindings";
import { useState } from "react";

import { RightPanelTabs } from "~/components/RightPanelTabs";
import {
  selectActiveRightPanelSurface,
  selectThreadRightPanelState,
  useRightPanelStore,
} from "~/rightPanelStore";
import { SideChatPanes } from "~/t3team/chat/t3team-SideChatPanes";
import { markSideChatPending } from "~/t3team/chat/t3team-sideChatPending";

const parentRef = scopeThreadRef(EnvironmentId.make("storybook"), ThreadId.make("story-parent"));
const PROMPTS = [
  "Warum schlägt die Freigabe für Lieferantenverträge mit abweichender Zahlungsfrist im Kanton Zug fehl?",
  "Kurze Frage",
  "Welche Tests decken die Überlaufbehandlung im Kreditorenbeleg ab, und wo fehlen noch Randfälle?",
];

function seedPendingSideChats(activeIndex: number) {
  useRightPanelStore.setState({ byThreadKey: {} });
  PROMPTS.forEach((prompt, index) => {
    const threadId = ThreadId.make(`pending-side-chat:story-${index}`);
    markSideChatPending(threadId, prompt);
    useRightPanelStore.getState().openSideChat(parentRef, threadId);
  });
  useRightPanelStore
    .getState()
    .activateSurface(parentRef, `side-chat:pending-side-chat:story-${activeIndex}`);
}

function PendingSideChatPanel(props: { readonly activeIndex: number; readonly width: number }) {
  useState(() => seedPendingSideChats(props.activeIndex));
  const state = useRightPanelStore((store) =>
    selectThreadRightPanelState(store.byThreadKey, parentRef),
  );
  const active = useRightPanelStore((store) =>
    selectActiveRightPanelSurface(store.byThreadKey, parentRef),
  );
  return (
    <div
      className="flex h-[560px] flex-col overflow-hidden rounded-lg border border-border bg-background"
      style={{ width: props.width }}
    >
      <RightPanelTabs
        mode="inline"
        keybindings={DEFAULT_RESOLVED_KEYBINDINGS}
        getShortcutContext={() => ({
          terminalFocus: false,
          terminalOpen: false,
          previewFocus: false,
          previewOpen: false,
          isWeb: true,
          isDesktop: false,
        })}
        surfaces={state.surfaces}
        environmentId={null}
        activeSurfaceId={active?.id ?? null}
        pendingSurfaceIds={new Set()}
        previewSessions={{}}
        desktopByTabId={{}}
        terminalLabelsById={new Map()}
        onActivate={(surface) =>
          useRightPanelStore.getState().activateSurface(parentRef, surface.id)
        }
        onCloseSurface={(surface) =>
          useRightPanelStore.getState().closeSurface(parentRef, surface.id)
        }
        onCloseOtherSurfaces={() => undefined}
        onCloseSurfacesToRight={() => undefined}
        onCloseAllSurfaces={() => undefined}
        onCopyFilePath={() => undefined}
        onAddBrowser={() => undefined}
        onAddBrowserInProfile={() => undefined}
        onAddTerminal={() => undefined}
        onAddDiff={() => undefined}
        onAddFiles={() => undefined}
        onAddPullRequest={() => undefined}
        onAddPullRequests={() => undefined}
        onAddDevice={() => undefined}
        browserAvailable={false}
        terminalAvailable={false}
        diffAvailable={false}
        filesAvailable={false}
        pullRequestAvailable={false}
        pullRequestsAvailable={false}
        deviceAvailable={false}
      >
        <SideChatPanes
          parentRef={parentRef}
          surfaces={state.surfaces}
          activeSurface={active}
          parentPanel={{ openToolDiff: () => undefined, runShellCommand: () => undefined }}
          onCloseSurface={(surface) =>
            useRightPanelStore.getState().closeSurface(parentRef, surface.id)
          }
        >
          {null}
        </SideChatPanes>
      </RightPanelTabs>
    </div>
  );
}

const meta = {
  title: "T3Team/Right Panel/Pending Side Chat",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj;

/** The tab opens on the click with the question shown; upstream's fork and first turn follow. */
export const LongQuestion: Story = {
  render: () => <PendingSideChatPanel activeIndex={0} width={560} />,
};

export const LongQuestionDark: Story = {
  ...LongQuestion,
  globals: { theme: "dark" },
};

export const NarrowPanel: Story = {
  render: () => <PendingSideChatPanel activeIndex={2} width={320} />,
};

export const NarrowPanelDark: Story = {
  ...NarrowPanel,
  globals: { theme: "dark" },
};
