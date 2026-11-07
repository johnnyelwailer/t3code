import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import { type ScopedThreadRef, ThreadId } from "@t3tools/contracts";
import { useRef } from "react";

import { useStableCallback } from "~/hooks/useStableCallback";
import { newThreadId } from "~/lib/utils";
import { useRightPanelStore } from "~/rightPanelStore";
import {
  clearSideChatPending,
  markSideChatPending,
  sideChatThreadIds,
} from "~/t3team/chat/t3team-sideChatPending";

type SideChatStarter = {
  readonly available: boolean;
  readonly open: (prompt?: string) => Promise<boolean>;
};

/**
 * Opens a pending side-chat tab at once, runs upstream's start unchanged, and lets the started tab
 * take the pending tab's place in the same store update. A failed start drops the pending tab.
 */
export async function openSideChatOptimistically(
  threadRef: ScopedThreadRef,
  startUpstream: (prompt?: string) => Promise<boolean>,
  prompt?: string,
): Promise<boolean> {
  const pendingThreadId = ThreadId.make(`pending-side-chat:${newThreadId()}`);
  const threadKey = scopedThreadKey(threadRef);
  const store = useRightPanelStore;
  const known = new Set<string>(sideChatThreadIds(store.getState().byThreadKey[threadKey]));
  markSideChatPending(pendingThreadId, prompt?.trim() || null);
  store.getState().openSideChat(threadRef, pendingThreadId);
  let settled = false;
  // Settling inside the store notification lands before React renders, so no frame shows both tabs.
  const unsubscribe = store.subscribe((state) => {
    const started = sideChatThreadIds(state.byThreadKey[threadKey]).find(
      (threadId) => threadId !== pendingThreadId && !known.has(threadId),
    );
    if (started === undefined || settled) return;
    settled = true;
    unsubscribe();
    state.settleSideChat(threadRef, pendingThreadId, started);
  });
  try {
    return await startUpstream(prompt);
  } finally {
    unsubscribe();
    if (!settled) store.getState().settleSideChat(threadRef, pendingThreadId, null);
    clearSideChatPending(pendingThreadId);
  }
}

/** Upstream's side chat with its tab shown on the click; one start at a time, as upstream's. */
export function useOptimisticSideChat(
  sideChat: SideChatStarter,
  threadRef: ScopedThreadRef | null,
): SideChatStarter {
  const startingRef = useRef(false);
  const open = async (prompt?: string) => {
    if (threadRef === null || !sideChat.available || startingRef.current) {
      return sideChat.open(prompt);
    }
    startingRef.current = true;
    return openSideChatOptimistically(threadRef, sideChat.open, prompt).finally(() => {
      startingRef.current = false;
    });
  };
  return { available: sideChat.available, open: useStableCallback(open) };
}
