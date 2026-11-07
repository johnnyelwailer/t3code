import type { ThreadId } from "@t3tools/contracts";
import { create } from "zustand";

import type { RightPanelSurface, ThreadRightPanelState } from "~/rightPanelStore";

type PendingSideChats = { readonly promptById: ReadonlyMap<string, string | null> };

/** Side chats whose tab is already open while upstream's fork, shell and first turn still run. */
const usePendingSideChats = create<PendingSideChats>(() => ({ promptById: new Map() }));

export function markSideChatPending(threadId: ThreadId, prompt: string | null): void {
  usePendingSideChats.setState((state) => ({
    promptById: new Map(state.promptById).set(threadId, prompt),
  }));
}

export function clearSideChatPending(threadId: ThreadId): void {
  usePendingSideChats.setState((state) => {
    const promptById = new Map(state.promptById);
    promptById.delete(threadId);
    return { promptById };
  });
}

/** `undefined` when the side chat is not pending; otherwise the prompt it was opened with. */
export function usePendingSideChatPrompt(threadId: ThreadId): string | null | undefined {
  return usePendingSideChats((state) =>
    state.promptById.has(threadId) ? (state.promptById.get(threadId) ?? null) : undefined,
  );
}

export function sideChatThreadIds(state: ThreadRightPanelState | undefined): ThreadId[] {
  return (state?.surfaces ?? []).flatMap((surface) =>
    surface.kind === "side-chat" ? [surface.threadId] : [],
  );
}

/**
 * Puts the started side chat where its pending tab was, or drops the pending tab when the start
 * failed (`threadId` null). Upstream appends the started tab, so that copy is removed here.
 */
export function settlePendingSideChat(
  current: ThreadRightPanelState,
  pendingThreadId: ThreadId,
  threadId: ThreadId | null,
): ThreadRightPanelState {
  const pendingSurfaceId = `side-chat:${pendingThreadId}`;
  const index = current.surfaces.findIndex((surface) => surface.id === pendingSurfaceId);
  if (index < 0) return current;
  const startedSurfaceId = threadId === null ? null : `side-chat:${threadId}`;
  const others = current.surfaces.filter(
    (surface) => surface.id !== pendingSurfaceId && surface.id !== startedSurfaceId,
  );
  if (threadId === null) {
    const activeSurfaceId =
      current.activeSurfaceId === pendingSurfaceId
        ? (others[Math.min(index, others.length - 1)]?.id ?? null)
        : current.activeSurfaceId;
    return {
      ...current,
      isOpen: others.length > 0 && current.isOpen,
      surfaces: others,
      activeSurfaceId,
    };
  }
  const started: RightPanelSurface = { id: `side-chat:${threadId}`, kind: "side-chat", threadId };
  const wasActive =
    current.activeSurfaceId === pendingSurfaceId || current.activeSurfaceId === started.id;
  return {
    ...current,
    surfaces: [...others.slice(0, index), started, ...others.slice(index)],
    activeSurfaceId: wasActive ? started.id : current.activeSurfaceId,
  };
}
