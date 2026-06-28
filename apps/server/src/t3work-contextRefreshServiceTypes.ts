import type { ThreadId } from "@t3tools/contracts";
import * as Data from "effect/Data";

export class T3workContextRefreshError extends Data.TaggedError("T3workContextRefreshError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export type T3workContextRefreshResult = {
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

export type T3workContextRefreshInput = {
  readonly threadId: ThreadId;
  readonly projectId: string;
  readonly workspaceRoot: string;
  readonly ticketKey: string;
  readonly force: boolean;
};

export type T3workContextProjectRefreshResult = {
  readonly ok: boolean;
  readonly status: "already_synced" | "synced";
  readonly projectId: string;
  readonly availability: "summary";
  readonly entryPointRelativePath: string;
  readonly manifestRelativePath: string;
  readonly workItemCount: number;
};

export type T3workContextProjectRefreshInput = {
  readonly threadId: ThreadId;
  readonly projectId: string;
  readonly workspaceRoot: string;
  readonly force: boolean;
};

export type T3workContextRefreshSliceResult = {
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

export type T3workContextRefreshSliceInput = {
  readonly threadId: ThreadId;
  readonly projectId: string;
  readonly workspaceRoot: string;
  readonly ticketKey: string;
  readonly focusKind: string;
  readonly focusLabel: string;
  readonly summaryItems: ReadonlyArray<{ readonly label: string; readonly value: string }>;
  readonly force: boolean;
};
