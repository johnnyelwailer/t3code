import { create } from "zustand";
import type { T3WorkContextAttachment } from "~/t3work/t3work-contextAttachment";

export type PendingChatContextItem = {
  projectId: string;
  attachment: T3WorkContextAttachment;
  createdAt: string;
};

export type PendingKickoffContextItem = {
  projectId: string;
  ticketId: string;
  attachment: T3WorkContextAttachment;
  createdAt: string;
};

function buildKickoffQueueKey(projectId: string, ticketId: string): string {
  return `${projectId}:${ticketId}`;
}

function hasDuplicateByDedupeKey<T extends { attachment: T3WorkContextAttachment }>(
  list: ReadonlyArray<T>,
  attachment: T3WorkContextAttachment,
): boolean {
  if (!attachment.dedupeKey) {
    return false;
  }
  return list.some((item) => item.attachment.dedupeKey === attachment.dedupeKey);
}

function hasThreadDuplicateByDedupeKey(
  list: ReadonlyArray<T3WorkContextAttachment>,
  attachment: T3WorkContextAttachment,
): boolean {
  if (!attachment.dedupeKey) {
    return false;
  }
  return list.some((item) => item.dedupeKey === attachment.dedupeKey);
}

type T3WorkAddToChatState = {
  pendingByProjectId: Record<string, PendingChatContextItem[]>;
  pendingByKickoffKey: Record<string, PendingKickoffContextItem[]>;
  threadAttachmentsByThreadId: Record<string, T3WorkContextAttachment[]>;
  enqueue: (item: PendingChatContextItem) => void;
  enqueueKickoff: (item: PendingKickoffContextItem) => void;
  enqueueThreadAttachment: (threadId: string, attachment: T3WorkContextAttachment) => void;
  removeThreadAttachment: (threadId: string, attachmentId: string) => void;
  clearThreadAttachments: (threadId: string) => void;
  drainProject: (projectId: string) => PendingChatContextItem[];
  drainKickoff: (projectId: string, ticketId: string) => PendingKickoffContextItem[];
};

export const useT3WorkAddToChatStore = create<T3WorkAddToChatState>((set, get) => ({
  pendingByProjectId: {},
  pendingByKickoffKey: {},
  threadAttachmentsByThreadId: {},
  enqueue: (item) => {
    set((state) => {
      const current = state.pendingByProjectId[item.projectId] ?? [];
      if (hasDuplicateByDedupeKey(current, item.attachment)) {
        return state;
      }
      return {
        pendingByProjectId: {
          ...state.pendingByProjectId,
          [item.projectId]: [...current, item],
        },
      };
    });
  },
  enqueueKickoff: (item) => {
    set((state) => {
      const key = buildKickoffQueueKey(item.projectId, item.ticketId);
      const current = state.pendingByKickoffKey[key] ?? [];
      if (hasDuplicateByDedupeKey(current, item.attachment)) {
        return state;
      }
      return {
        pendingByKickoffKey: {
          ...state.pendingByKickoffKey,
          [key]: [...current, item],
        },
      };
    });
  },
  enqueueThreadAttachment: (threadId, attachment) => {
    set((state) => {
      const current = state.threadAttachmentsByThreadId[threadId] ?? [];
      if (current.some((candidate) => candidate.id === attachment.id)) {
        return state;
      }
      if (hasThreadDuplicateByDedupeKey(current, attachment)) {
        return state;
      }
      return {
        threadAttachmentsByThreadId: {
          ...state.threadAttachmentsByThreadId,
          [threadId]: [...current, attachment],
        },
      };
    });
  },
  removeThreadAttachment: (threadId, attachmentId) => {
    set((state) => {
      const current = state.threadAttachmentsByThreadId[threadId] ?? [];
      if (current.length === 0) {
        return state;
      }
      const nextForThread = current.filter((attachment) => attachment.id !== attachmentId);
      const next = { ...state.threadAttachmentsByThreadId };
      if (nextForThread.length === 0) {
        delete next[threadId];
      } else {
        next[threadId] = nextForThread;
      }
      return { threadAttachmentsByThreadId: next };
    });
  },
  clearThreadAttachments: (threadId) => {
    set((state) => {
      if (!state.threadAttachmentsByThreadId[threadId]) {
        return state;
      }
      const next = { ...state.threadAttachmentsByThreadId };
      delete next[threadId];
      return { threadAttachmentsByThreadId: next };
    });
  },
  drainProject: (projectId) => {
    const current = get().pendingByProjectId[projectId] ?? [];
    set((state) => {
      if (!state.pendingByProjectId[projectId]) {
        return state;
      }
      const next = { ...state.pendingByProjectId };
      delete next[projectId];
      return { pendingByProjectId: next };
    });
    return current;
  },
  drainKickoff: (projectId, ticketId) => {
    const key = buildKickoffQueueKey(projectId, ticketId);
    const current = get().pendingByKickoffKey[key] ?? [];
    set((state) => {
      if (!state.pendingByKickoffKey[key]) {
        return state;
      }
      const next = { ...state.pendingByKickoffKey };
      delete next[key];
      return { pendingByKickoffKey: next };
    });
    return current;
  },
}));

export { buildKickoffQueueKey };
