import type { Meta, StoryObj } from "@storybook/react";
import { MessagesSquare } from "lucide-react";
import { useEffect, useMemo } from "react";

import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";

import { RightPanelTabs } from "~/components/RightPanelTabs";
import { Button } from "~/components/ui/button";
import {
  selectActiveRightPanelSurface,
  selectThreadRightPanelState,
  useRightPanelStore,
} from "~/rightPanelStore";

/**
 * Side chat as a standard right-panel tab.
 *
 * WHAT THIS STORY IS
 * ------------------
 * The REAL `RightPanelTabs` chrome driven by the REAL `rightPanelStore`, with story-side
 * stand-in content panes. The "Side chat" controls call the SAME `openThreadSurface` action
 * the actor-message thread chip calls in-app (`useT3TeamOpenSenderThread`), so tab creation,
 * ordering, activation, and close behavior are production code; only the pane bodies are
 * stand-ins (the app renders a full `ThreadChatView` per tab via
 * `t3team-ThreadRightPanelSurface`).
 *
 * NOTE ON TITLES: tab labels come from the live thread-shell registry, which is empty outside
 * the app, so side-chat tabs fall back to "Thread" here (in-app they show the thread title).
 * The stand-in panes name the peer thread so the tabs stay distinguishable.
 *
 * THE DEMO (both light and dark):
 *   - open a Files tab, a Browser tab, and two side chats; they coexist as peer tabs,
 *   - Thread B's panel proves the state is thread-scoped: it stays closed/empty while
 *     Thread A accumulates tabs,
 *   - close/activate/context-menu behave like every other surface.
 */

const STORY_ENVIRONMENT_ID = EnvironmentId.make("storybook");
const STORY_THREAD_A = "story-thread-a";
const STORY_THREAD_B = "story-thread-b";
const STORY_PEER_1_ID = "story-peer-accessibility";
const STORY_PEER_2_ID = "story-peer-orchestration";

function peerLabel(threadId: string): string {
  if (threadId === STORY_PEER_1_ID) return "Accessibility review";
  if (threadId === STORY_PEER_2_ID) return "Orchestration plan";
  return threadId;
}

function SideChatSurfaceStandIn({ threadId }: { threadId: string }) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto bg-background p-4 text-sm">
      <div className="flex items-center gap-2 text-muted-foreground">
        <MessagesSquare className="size-4" />
        <span className="font-medium text-foreground">Side chat · {peerLabel(threadId)}</span>
      </div>
      <p className="text-muted-foreground">
        In-app this pane is a full embedded <code className="font-mono">ThreadChatView</code> for
        the peer thread. Story stand-in only.
      </p>
      <div className="rounded-md border border-border/70 bg-card/30 p-3">
        <div className="mb-1 text-xs text-muted-foreground">Peer thread</div>
        <div>Looks sharp — merged the icon change and pushed the follow-up fix.</div>
      </div>
      <div className="rounded-md border border-border/70 bg-card/30 p-3">
        <div className="mb-1 text-xs text-muted-foreground">You</div>
        <div>Good, thanks. Keeping this side chat open next to my files.</div>
      </div>
    </div>
  );
}

function standInPane(title: string) {
  return (
    <div className="flex h-full min-h-0 items-center justify-center bg-background text-sm text-muted-foreground">
      {title}
    </div>
  );
}

function PanelDemo({ threadId, label }: { threadId: string; label: string }) {
  const ref = useMemo(
    () => scopeThreadRef(STORY_ENVIRONMENT_ID, ThreadId.make(threadId)),
    [threadId],
  );
  const state = useRightPanelStore((store) => selectThreadRightPanelState(store.byThreadKey, ref));
  const activeSurface = useRightPanelStore((store) =>
    selectActiveRightPanelSurface(store.byThreadKey, ref),
  );

  const openSideChat = (peerId: string) =>
    useRightPanelStore.getState().openThreadSurface(ref, peerId);

  const content =
    activeSurface?.kind === "thread" ? (
      <SideChatSurfaceStandIn threadId={activeSurface.threadId} />
    ) : activeSurface?.kind === "files" || activeSurface?.kind === "file" ? (
      standInPane("Files (stand-in pane)")
    ) : activeSurface?.kind === "preview" ? (
      standInPane("Browser (stand-in pane)")
    ) : activeSurface?.kind === "agents" ? (
      standInPane("Agents (stand-in pane)")
    ) : activeSurface?.kind === "diff" ? (
      standInPane("Diff (stand-in pane)")
    ) : (
      standInPane("Open a surface")
    );

  return (
    <div className="flex w-96 flex-col gap-3">
      <div>
        <div className="mb-1 text-xs font-medium text-muted-foreground">{label}</div>
        <div className="flex flex-wrap gap-1.5">
          <Button size="xs" variant="outline" onClick={() => openSideChat(STORY_PEER_1_ID)}>
            <MessagesSquare />
            Side chat: Accessibility review
          </Button>
          <Button size="xs" variant="outline" onClick={() => openSideChat(STORY_PEER_2_ID)}>
            <MessagesSquare />
            Side chat: Orchestration plan
          </Button>
          <Button
            size="xs"
            variant="outline"
            onClick={() => useRightPanelStore.getState().open(ref, "files")}
          >
            Files
          </Button>
          <Button
            size="xs"
            variant="outline"
            onClick={() => useRightPanelStore.getState().open(ref, "agents")}
          >
            Agents
          </Button>
          <Button
            size="xs"
            variant="outline"
            onClick={() => useRightPanelStore.getState().openBrowser(ref, null)}
          >
            Browser
          </Button>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => useRightPanelStore.getState().close(ref)}
          >
            Close panel
          </Button>
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border border-border/70 bg-card/30">
        {state.isOpen ? (
          <RightPanelTabs
            mode="inline"
            surfaces={state.surfaces}
            activeSurfaceId={activeSurface?.id ?? null}
            pendingSurfaceIds={new Set()}
            previewSessions={{}}
            desktopByTabId={{}}
            terminalLabelsById={new Map()}
            onActivate={(surface) => useRightPanelStore.getState().activateSurface(ref, surface.id)}
            onCloseSurface={(surface) =>
              useRightPanelStore.getState().closeSurface(ref, surface.id)
            }
            onCloseOtherSurfaces={(surface) =>
              useRightPanelStore.getState().closeOtherSurfaces(ref, surface.id)
            }
            onCloseSurfacesToRight={(surface) =>
              useRightPanelStore.getState().closeSurfacesToRight(ref, surface.id)
            }
            onCloseAllSurfaces={() => useRightPanelStore.getState().closeAllSurfaces(ref)}
            onCopyFilePath={() => undefined}
            onAddBrowser={() => useRightPanelStore.getState().openBrowser(ref, null)}
            onAddTerminal={() => undefined}
            onAddDiff={() => useRightPanelStore.getState().toggle(ref, "diff")}
            onAddFiles={() => useRightPanelStore.getState().open(ref, "files")}
            onAddPullRequest={() => undefined}
            onAddAgents={() => useRightPanelStore.getState().open(ref, "agents")}
            browserAvailable
            terminalAvailable={false}
            diffAvailable
            filesAvailable
            pullRequestAvailable={false}
            agentsAvailable
            liveAgentCount={0}
          >
            {content}
          </RightPanelTabs>
        ) : (
          <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
            Right panel closed for {label}
          </div>
        )}
      </div>
    </div>
  );
}

function SideChatStoryBody({ dark }: { dark: boolean }) {
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    // Start clean and leave no demo state behind in the app's persisted store.
    useRightPanelStore.setState({ byThreadKey: {} });
    return () => {
      document.documentElement.classList.remove("dark");
      useRightPanelStore.setState({ byThreadKey: {} });
    };
  }, [dark]);

  return (
    <div className="flex flex-wrap gap-8">
      <PanelDemo threadId={STORY_THREAD_A} label="Thread A — its own panel state" />
      <PanelDemo threadId={STORY_THREAD_B} label="Thread B — separate panel state" />
    </div>
  );
}

const meta = {
  title: "RightPanel/SideChatTab",
  parameters: {
    layout: "padded",
  },
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const SideChatTabs: Story = {
  render: () => <SideChatStoryBody dark={false} />,
};

/** The same document in the dark theme: no hardcoded colours, so only the tokens change. */
export const SideChatTabsDark: Story = {
  render: () => <SideChatStoryBody dark />,
  parameters: { t3teamTheme: "dark" },
};
