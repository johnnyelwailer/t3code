/**
 * Persisted context chat state: thread -> binding writes the server has not acknowledged yet, and
 * each binding's open server thread. A pending entry is written before the first send dispatches,
 * because the thread is only created inside that dispatch.
 */
import type { EnvironmentId, T3TeamContextBinding, ThreadId } from "@t3tools/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "~/lib/storage";

export interface PendingContextBinding {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly binding: T3TeamContextBinding;
  /** Epoch ms of the first dispatch, so a thread that never appeared can be given up on. */
  readonly queuedAt: number;
}

export interface ActiveContextChat {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
}

export const pendingBindingKey = (environmentId: string, threadId: string) =>
  `${environmentId}|${threadId}`;

interface ContextChatPendingState {
  readonly pending: Readonly<Record<string, PendingContextBinding>>;
  readonly activeByBindingKey: Readonly<Record<string, ActiveContextChat>>;
  /** Keeps the first entry for a thread, so a resend does not move `queuedAt`. */
  readonly addPending: (entry: PendingContextBinding) => void;
  readonly clearPending: (environmentId: string, threadId: string) => void;
  readonly setActive: (bindingKey: string, chat: ActiveContextChat) => void;
  readonly clearActive: (bindingKey: string) => void;
}

const without = <T>(record: Readonly<Record<string, T>>, key: string) => {
  const { [key]: _removed, ...rest } = record;
  return rest;
};

export const useContextChatPendingStore = create<ContextChatPendingState>()(
  persist(
    (set) => ({
      pending: {},
      activeByBindingKey: {},
      addPending: (entry) =>
        set((state) => {
          const key = pendingBindingKey(entry.environmentId, entry.threadId);
          return state.pending[key] === undefined
            ? { pending: { ...state.pending, [key]: entry } }
            : state;
        }),
      clearPending: (environmentId, threadId) =>
        set((state) => {
          const key = pendingBindingKey(environmentId, threadId);
          return state.pending[key] === undefined
            ? state
            : { pending: without(state.pending, key) };
        }),
      setActive: (bindingKey, chat) =>
        set((state) => ({
          activeByBindingKey: { ...state.activeByBindingKey, [bindingKey]: chat },
        })),
      clearActive: (bindingKey) =>
        set((state) =>
          state.activeByBindingKey[bindingKey] === undefined
            ? state
            : { activeByBindingKey: without(state.activeByBindingKey, bindingKey) },
        ),
    }),
    {
      name: "t3code:context-chat:v1",
      version: 1,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: ({ pending, activeByBindingKey }) => ({ pending, activeByBindingKey }),
    },
  ),
);
