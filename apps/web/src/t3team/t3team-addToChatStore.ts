import { create } from "zustand";
import { forgetContextAttachmentRequest } from "~/t3team/t3team-contextAttachmentSync";
import {
  buildKickoffQueueKey,
  deleteRecordEntry,
  hasQueuedAttachmentDuplicate,
  hasThreadAttachmentDuplicate,
  dedupeThreadAttachmentsByKey,
  removeThreadAttachmentList,
  replaceQueuedAttachment,
  replaceThreadAttachmentList,
} from "~/t3team/t3team-addToChatStoreHelpers";
import type { T3TeamAddToChatState } from "~/t3team/t3team-addToChatStore.types";

export const useT3TeamAddToChatStore = create<T3TeamAddToChatState>((set, get) => ({
  pendingByProjectId: {},
  pendingByKickoffKey: {},
  threadAttachmentsByThreadId: {},
  enqueue: (item) => {
    set((state) => {
      const current = state.pendingByProjectId[item.projectId] ?? [];
      if (hasQueuedAttachmentDuplicate(current, item.attachment)) return state;
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
      if (hasQueuedAttachmentDuplicate(current, item.attachment)) return state;
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
      if (current.some((candidate) => candidate.id === attachment.id)) return state;
      if (hasThreadAttachmentDuplicate(current, attachment)) return state;
      return {
        threadAttachmentsByThreadId: {
          ...state.threadAttachmentsByThreadId,
          [threadId]: dedupeThreadAttachmentsByKey([...current, attachment]),
        },
      };
    });
  },
  replaceProjectAttachment: (projectId, attachmentId, attachment) => {
    let replaced = false;
    set((state) => {
      const current = state.pendingByProjectId[projectId] ?? [];
      if (current.length === 0) return state;
      const nextForProject = replaceQueuedAttachment({
        list: current,
        attachmentId,
        buildReplacement: (item) => ({
          projectId: item.projectId,
          attachment,
          createdAt: item.createdAt,
        }),
      });
      if (!nextForProject.changed) {
        return state;
      }
      replaced = true;
      return {
        pendingByProjectId: {
          ...state.pendingByProjectId,
          [projectId]: nextForProject.items,
        },
      };
    });
    return replaced;
  },
  replaceKickoffAttachment: (projectId, ticketId, attachmentId, attachment) => {
    const key = buildKickoffQueueKey(projectId, ticketId);
    let replaced = false;
    set((state) => {
      const current = state.pendingByKickoffKey[key] ?? [];
      if (current.length === 0) return state;
      const nextForKickoff = replaceQueuedAttachment({
        list: current,
        attachmentId,
        buildReplacement: (item) => ({
          projectId: item.projectId,
          ticketId: item.ticketId,
          attachment,
          createdAt: item.createdAt,
        }),
      });
      if (!nextForKickoff.changed) {
        return state;
      }
      replaced = true;
      return {
        pendingByKickoffKey: {
          ...state.pendingByKickoffKey,
          [key]: nextForKickoff.items,
        },
      };
    });
    return replaced;
  },
  replaceThreadAttachment: (threadId, attachmentId, attachment) => {
    set((state) => {
      const current = state.threadAttachmentsByThreadId[threadId] ?? [];
      if (current.length === 0) return state;
      const nextForThread = replaceThreadAttachmentList({
        list: current,
        attachmentId,
        attachment,
      });
      if (!nextForThread.changed) {
        return state;
      }
      return {
        threadAttachmentsByThreadId: {
          ...state.threadAttachmentsByThreadId,
          [threadId]: dedupeThreadAttachmentsByKey(nextForThread.items),
        },
      };
    });
  },
  removeThreadAttachment: (threadId, attachmentId) => {
    forgetContextAttachmentRequest(attachmentId);
    set((state) => {
      const current = state.threadAttachmentsByThreadId[threadId] ?? [];
      if (current.length === 0) return state;
      const nextForThread = removeThreadAttachmentList(current, attachmentId);
      if (nextForThread.length === 0) {
        return {
          threadAttachmentsByThreadId: deleteRecordEntry(
            state.threadAttachmentsByThreadId,
            threadId,
          ),
        };
      }
      return {
        threadAttachmentsByThreadId: {
          ...state.threadAttachmentsByThreadId,
          [threadId]: nextForThread,
        },
      };
    });
  },
  clearThreadAttachments: (threadId) => {
    set((state) => {
      const current = state.threadAttachmentsByThreadId[threadId];
      if (!current) return state;
      for (const attachment of current) {
        forgetContextAttachmentRequest(attachment.id);
      }
      return {
        threadAttachmentsByThreadId: deleteRecordEntry(state.threadAttachmentsByThreadId, threadId),
      };
    });
  },
  drainProject: (projectId) => {
    const current = get().pendingByProjectId[projectId] ?? [];
    set((state) => {
      if (!state.pendingByProjectId[projectId]) {
        return state;
      }
      return { pendingByProjectId: deleteRecordEntry(state.pendingByProjectId, projectId) };
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
      return { pendingByKickoffKey: deleteRecordEntry(state.pendingByKickoffKey, key) };
    });
    return current;
  },
}));

export { buildKickoffQueueKey };
