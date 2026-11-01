/**
 * The body of a context view's pinned Chat tab: the new-thread composer embedded in the host's
 * right panel. Only the wrapper is upstream's side chat pane (`data-side-chat-pane`, background
 * context, no composer handle, panel hosting). A side chat needs a parent thread; this chat has
 * only a binding, so it starts as a draft and becomes a server thread on its first send.
 */
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ScopedThreadRef, T3TeamContextBinding } from "@t3tools/contracts";
import { useEffect } from "react";

import { BackgroundThreadContext } from "~/components/chat/backgroundThread";
import ChatView from "~/components/ChatView";
import { ComposerHandleContext } from "~/composerHandleContext";
import type { SideChatParentPanel } from "~/lib/sideChatPane";
import { hostRightPanel } from "~/rightPanelStore";

import { ContextChatPaneFrame } from "./t3team-ContextChatPaneFrame";
import { useContextChatDraft } from "./t3team-useContextChatDraft";

// The aside has no diff or terminal panel to send these to (see MyWorkRightPanel).
const NO_PANEL_ACTIONS: SideChatParentPanel = {
  openToolDiff: () => undefined,
  runShellCommand: () => undefined,
};

export function ContextChatPane(props: {
  readonly environmentId: EnvironmentId;
  readonly binding: T3TeamContextBinding;
  /** The right panel that owns this tab; the chat's panel actions (browser) open there. */
  readonly hostRef: ScopedThreadRef;
}) {
  const { environmentId, hostRef } = props;
  const chat = useContextChatDraft({ environmentId, binding: props.binding });
  const { view } = chat;
  const threadId = view.kind === "draft" ? view.draft.threadId : view.threadId;

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- registers the host panel for this chat's panel actions
  useEffect(
    () => hostRightPanel(scopeThreadRef(environmentId, threadId), hostRef),
    [environmentId, hostRef, threadId],
  );

  return (
    <ContextChatPaneFrame onNewChat={chat.newChat}>
      <BackgroundThreadContext value>
        <ComposerHandleContext value={null}>
          {view.kind === "draft" ? (
            <ChatView
              key={view.draft.draftId}
              environmentId={environmentId}
              threadId={view.draft.threadId}
              routeKind="draft"
              draftId={view.draft.draftId}
              embedded={NO_PANEL_ACTIONS}
              hideBranchToolbar
              beforeDispatchTurnStart={chat.beforeDispatchTurnStart}
            />
          ) : (
            <ChatView
              key={view.threadId}
              environmentId={environmentId}
              threadId={view.threadId}
              routeKind="server"
              embedded={NO_PANEL_ACTIONS}
              hideBranchToolbar
            />
          )}
        </ComposerHandleContext>
      </BackgroundThreadContext>
    </ContextChatPaneFrame>
  );
}
