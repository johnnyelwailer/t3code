import type { T3TeamContextAttachment } from "~/t3team/t3team-contextAttachment";

export type PendingChatContextItem = {
  projectId: string;
  attachment: T3TeamContextAttachment;
  createdAt: string;
};

export type PendingKickoffContextItem = {
  projectId: string;
  ticketId: string;
  attachment: T3TeamContextAttachment;
  createdAt: string;
};

export type T3TeamAddToChatState = {
  pendingByProjectId: Record<string, PendingChatContextItem[]>;
  pendingByKickoffKey: Record<string, PendingKickoffContextItem[]>;
  threadAttachmentsByThreadId: Record<string, T3TeamContextAttachment[]>;
  enqueue: (item: PendingChatContextItem) => void;
  enqueueKickoff: (item: PendingKickoffContextItem) => void;
  enqueueThreadAttachment: (threadId: string, attachment: T3TeamContextAttachment) => void;
  replaceProjectAttachment: (
    projectId: string,
    attachmentId: string,
    attachment: T3TeamContextAttachment,
  ) => boolean;
  replaceKickoffAttachment: (
    projectId: string,
    ticketId: string,
    attachmentId: string,
    attachment: T3TeamContextAttachment,
  ) => boolean;
  replaceThreadAttachment: (
    threadId: string,
    attachmentId: string,
    attachment: T3TeamContextAttachment,
  ) => void;
  removeThreadAttachment: (threadId: string, attachmentId: string) => void;
  clearThreadAttachments: (threadId: string) => void;
  drainProject: (projectId: string) => PendingChatContextItem[];
  drainKickoff: (projectId: string, ticketId: string) => PendingKickoffContextItem[];
};
