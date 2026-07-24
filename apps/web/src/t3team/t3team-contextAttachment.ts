export type T3TeamContextAttachmentSyncItem = {
  id: string;
  label: string;
  detail?: string;
  status: "completed" | "active" | "pending";
  sizeBytes?: number;
};

export type T3TeamContextAttachmentSyncInfo = {
  contentLabel?: string;
  currentItemLabel?: string;
  currentItemDetail?: string;
  bytesCurrent?: number;
  bytesTotal?: number;
  startedAt?: string;
  items?: ReadonlyArray<T3TeamContextAttachmentSyncItem>;
};

export type T3TeamContextAttachment = {
  id: string;
  kind: string;
  label: string;
  jiraIssueType?: string;
  jiraIssueTypeIconUrl?: string;
  dedupeKey?: string;
  description?: string;
  summaryItems?: ReadonlyArray<{ label: string; value: string }>;
  fileReferences?: ReadonlyArray<{ label: string; relativePath: string }>;
  syncStatus?: "syncing" | "synced" | "error";
  syncPhase?: string;
  syncProgressCurrent?: number;
  syncProgressTotal?: number;
  syncInfo?: T3TeamContextAttachmentSyncInfo;
  syncedAt?: string;
  syncError?: string;
  contextText: string;
};
