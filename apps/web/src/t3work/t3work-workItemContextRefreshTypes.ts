export type T3workWorkItemContextRefreshResult = {
  readonly ok: boolean;
  readonly status: "already_synced" | "synced";
  readonly projectId: string;
  readonly ticketKey: string;
  readonly availability: "full";
  readonly entryPointRelativePath: string;
  readonly manifestRelativePath: string;
  readonly includedCount: number;
  readonly skippedCount: number;
  readonly backgroundJobId?: string;
  readonly backgroundTargetDepth?: number;
  readonly backgroundQueued?: number;
};

export type T3workWorkItemSliceContextRefreshResult = {
  readonly ok: boolean;
  readonly status: "already_synced" | "synced";
  readonly projectId: string;
  readonly ticketKey: string;
  readonly focusKind: string;
  readonly availability: "full";
  readonly focusEntryPointRelativePath: string;
  readonly entryPointRelativePath: string;
  readonly attachmentIndexRelativePath?: string;
  readonly includedCount: number;
  readonly skippedCount: number;
  readonly backgroundQueued?: number;
};
