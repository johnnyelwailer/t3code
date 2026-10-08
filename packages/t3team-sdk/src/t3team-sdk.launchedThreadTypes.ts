/**
 * Author types for `launchThread`: top-level threads a workflow launches and keeps addressing.
 * See `t3team-sdk.launchedThreads.ts` for the semantics.
 */
import type { ModelOption } from "@runbook/threads/models";

export type LaunchedThreadRuntimeMode =
  | "approval-required"
  | "auto-accept-edits"
  | "auto"
  | "full-access";

/** Where a launched thread works; the shapes `t3_thread_launch` takes. */
export type LaunchedThreadWorkspace =
  | { readonly type: "root" }
  | {
      readonly type: "worktree";
      readonly baseRef: string;
      readonly branch?: string;
      readonly startFromOrigin?: boolean;
    }
  | { readonly type: "existing_worktree"; readonly worktreePath: string; readonly branch?: string };

export interface LaunchThreadOpts {
  /**
   * Names the thread within this recipe and project: the same key always returns the same
   * thread, in this run, after a restart, and in a later run of the same recipe.
   */
  readonly key: string;
  readonly title: string;
  /** The first message, sent only when this call creates the thread. */
  readonly message?: string;
  /** `instance/slug` or `instance`; absent uses the run's model. */
  readonly model?: ModelOption;
  /** Absent inherits the run's mode; never above it. */
  readonly runtimeMode?: LaunchedThreadRuntimeMode;
  readonly interactionMode?: "default" | "plan";
  /** Absent is the project root. */
  readonly workspace?: LaunchedThreadWorkspace;
}

/** One linked pull request as the thread sees it: the synced snapshot and the watch. */
export interface LaunchedThreadPullRequest {
  readonly host: string;
  readonly repository: string;
  readonly number: number;
  readonly url: string;
  /** The host's last synced read of the pull request; null until the first sync. */
  readonly snapshot: {
    readonly state: "open" | "closed" | "merged";
    readonly title: string;
    readonly headBranch: string;
    readonly baseBranch: string;
    readonly isDraft: boolean;
    readonly author: string | null;
    readonly checksState: string | null;
    readonly mergeability: string | null;
    readonly reviewDecision: string | null;
    readonly updatedAt: string | null;
  } | null;
  readonly watching: boolean;
  /** The head commit the watch last read; null when not watching or not read yet. */
  readonly watchHeadSha: string | null;
}

export interface LaunchedThreadState {
  readonly threadId: string;
  readonly deleted: boolean;
  readonly archived: boolean;
  readonly settled: boolean;
  readonly runtimeMode: LaunchedThreadRuntimeMode;
  /** `instance/model`. */
  readonly model: string;
  /** A turn is running. */
  readonly working: boolean;
  /** The agent asked the user something that is still open. */
  readonly pendingQuestion: boolean;
  /** A tool call waits for the user's approval. */
  readonly pendingApproval: boolean;
  readonly pullRequests: ReadonlyArray<LaunchedThreadPullRequest>;
}

export interface LaunchedThread {
  readonly id: string;
  readonly key: string;
  /** True when this call created the thread; false when the key already had one. */
  readonly created: boolean;
  /** Start (or stop) the host's watch of a pull request for this thread's agent; links it first. */
  readonly watchPullRequest: (url: string, watching?: boolean) => Promise<void>;
  /** A message to the thread's agent, queued behind a running turn. */
  readonly send: (text: string) => Promise<void>;
  /** Switch the thread's model or access mode; never above the run's mode. */
  readonly configure: (opts: {
    readonly model?: ModelOption;
    readonly runtimeMode?: LaunchedThreadRuntimeMode;
  }) => Promise<void>;
  readonly read: () => Promise<LaunchedThreadState>;
  /** Merge `extensions` thread facts; `null` removes a key. `t3team.*` keys are the host's. */
  readonly setFacts: (extensions: Readonly<Record<string, unknown>>) => Promise<void>;
}

export interface LaunchedThreadPrimitives {
  readonly launchThread: (opts: LaunchThreadOpts) => Promise<LaunchedThread>;
  /** Merge `extensions` facts on the run's own launch thread (a card's summary). */
  readonly setRunFacts: (extensions: Readonly<Record<string, unknown>>) => Promise<void>;
}
