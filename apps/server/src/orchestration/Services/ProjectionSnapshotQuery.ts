/**
 * ProjectionSnapshotQuery - Read-model snapshot query service interface.
 *
 * Exposes the current orchestration projection snapshot for read-only API
 * access.
 *
 * @module ProjectionSnapshotQuery
 */
import type {
  AgentSessionImportSource,
  ApprovalRequestId,
  CheckpointRef,
  EnvironmentId,
  MessageId,
  OrchestrationCheckpointSummary,
  OrchestrationMessage,
  OrchestrationProject,
  OrchestrationProjectShell,
  OrchestrationReadModel,
  OrchestrationSearchThreadsInput,
  OrchestrationSearchThreadsResult,
  OrchestrationShellSnapshot,
  OrchestrationThread,
  OrchestrationThreadActivity,
  OrchestrationThreadDetailSnapshot,
  OrchestrationThreadDetailWindow,
  OrchestrationThreadShell,
  ProjectId,
  ThreadId,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import type * as Option from "effect/Option";
import type * as Effect from "effect/Effect";

import type { ProjectionRepositoryError } from "../../persistence/Errors.ts";

export interface ProjectionSnapshotCounts {
  readonly projectCount: number;
  readonly threadCount: number;
}

export interface ProjectionSnapshotSequence {
  readonly snapshotSequence: number;
}

export interface ProjectionEventReplayStats {
  readonly eventCount: number;
  readonly payloadBytes: number;
}

export interface ProjectionThreadCheckpointContext {
  readonly threadId: ThreadId;
  readonly projectId: ProjectId;
  readonly workspaceRoot: string;
  readonly worktreePath: string | null;
  readonly checkpoints: ReadonlyArray<OrchestrationCheckpointSummary>;
}

export interface ProjectionFullThreadDiffContext {
  readonly threadId: ThreadId;
  readonly projectId: ProjectId;
  readonly workspaceRoot: string;
  readonly worktreePath: string | null;
  readonly latestCheckpointTurnCount: number;
  readonly toCheckpointRef: CheckpointRef | null;
}

export interface ProjectionThreadDetailQuery {
  /**
   * Limit activities before SQLite returns and decodes their payloads.
   * Any explicit filter omits pinned-request reads. An empty list also skips
   * the activity query. Omit this option to preserve the full detail response.
   */
  readonly activityKinds?: ReadonlyArray<string>;
}

/**
 * ProjectionSnapshotQueryShape - Service API for read-model snapshots.
 */
export interface ProjectionSnapshotQueryShape {
  /** Read the latest request or resolution without loading the thread history. */
  readonly getUserInputActivity: (input: {
    readonly threadId: ThreadId;
    readonly requestId: ApprovalRequestId;
  }) => Effect.Effect<Option.Option<OrchestrationThreadActivity>, ProjectionRepositoryError>;

  /**
   * Read every activity of one kind across active (not deleted, not archived)
   * threads, without hydrating the threads. Used at startup to find state a
   * crashed process left behind.
   */
  readonly listActivitiesByKind: (
    kind: string,
  ) => Effect.Effect<ReadonlyArray<OrchestrationThreadActivity>, ProjectionRepositoryError>;

  /**
   * Read the lightweight command snapshot used to bootstrap the in-memory
   * orchestration engine without hydrating message/activity/checkpoint bodies.
   */
  readonly getCommandReadModel: () => Effect.Effect<
    OrchestrationReadModel,
    ProjectionRepositoryError
  >;

  /**
   * Read the latest orchestration projection snapshot.
   *
   * Rehydrates from projection tables and derives snapshot sequence from
   * projector cursor state.
   */
  readonly getSnapshot: () => Effect.Effect<OrchestrationReadModel, ProjectionRepositoryError>;

  /**
   * Read the latest orchestration shell snapshot.
   *
   * Returns only projects and thread shell summaries so clients can bootstrap
   * lightweight navigation state without hydrating every thread body.
   */
  readonly getShellSnapshot: () => Effect.Effect<
    OrchestrationShellSnapshot,
    ProjectionRepositoryError
  >;

  /**
   * Read archived thread shell summaries for the archive page.
   *
   * This query is separate from the main shell snapshot so archived threads
   * are never bootstrapped into normal navigation state.
   */
  readonly getArchivedShellSnapshot: () => Effect.Effect<
    OrchestrationShellSnapshot,
    ProjectionRepositoryError
  >;

  /** Durable worktree ownership retained after thread deletion, including across restarts. */
  readonly getDeletedWorktreeThreads: () => Effect.Effect<
    ReadonlyArray<{
      readonly id: ThreadId;
      readonly projectId: ProjectId;
      readonly branch: string;
      readonly worktreePath: string;
      readonly workspaceRoot: string;
      readonly deletedAt: string;
    }>,
    ProjectionRepositoryError
  >;

  /**
   * Search active thread navigation metadata, user messages, and canonical
   * assistant outputs without hydrating thread detail snapshots.
   */
  readonly searchThreads: (
    input: OrchestrationSearchThreadsInput,
  ) => Effect.Effect<OrchestrationSearchThreadsResult, ProjectionRepositoryError>;

  /**
   * Read the latest projection snapshot sequence without hydrating read-model
   * entities.
   */
  readonly getSnapshotSequence: () => Effect.Effect<
    ProjectionSnapshotSequence,
    ProjectionRepositoryError
  >;

  /**
   * Read aggregate projection counts without hydrating the full read model.
   */
  readonly getCounts: () => Effect.Effect<ProjectionSnapshotCounts, ProjectionRepositoryError>;

  /**
   * Measure a persisted event range without decoding its payload bodies.
   */
  readonly getEventReplayStats: (input: {
    readonly fromSequenceExclusive: number;
    readonly toSequenceInclusive: number;
  }) => Effect.Effect<ProjectionEventReplayStats, ProjectionRepositoryError>;

  /**
   * Read the active project for an exact workspace root match.
   */
  readonly getActiveProjectByWorkspaceRoot: (
    workspaceRoot: string,
  ) => Effect.Effect<Option.Option<OrchestrationProject>, ProjectionRepositoryError>;

  /**
   * Read a single active project shell row by id.
   */
  readonly getProjectShellById: (
    projectId: ProjectId,
  ) => Effect.Effect<Option.Option<OrchestrationProjectShell>, ProjectionRepositoryError>;

  readonly getProjectShells: (
    projectIds?: ReadonlyArray<ProjectId>,
  ) => Effect.Effect<ReadonlyArray<OrchestrationProjectShell>, ProjectionRepositoryError>;

  /**
   * Read the earliest active thread for a project.
   */
  readonly getFirstActiveThreadIdByProjectId: (
    projectId: ProjectId,
  ) => Effect.Effect<Option.Option<ThreadId>, ProjectionRepositoryError>;

  /** Read completed import sources without loading thread history. */
  readonly getImportedAgentSessionSources: (projectId: ProjectId) => Effect.Effect<
    ReadonlyArray<{
      readonly threadId: ThreadId;
      readonly source: AgentSessionImportSource;
    }>,
    ProjectionRepositoryError
  >;

  /**
   * List the active child thread ids of a parent thread, derived from the
   * durable parent/child relation (a child's t3team.handoff.created
   * parentThreadId, or a t3team.handoff.started childThreadId on the parent)
   * rather than the parent's own activity load. Same project, non-deleted,
   * newest (by updated_at) first. This is the relation the sidebar/fork
   * section render; the `t3team.thread.children` list op uses it so the tool
   * agrees with the UI (GHE #178).
   */
  readonly listChildThreadIdsByParent: (
    parentThreadId: ThreadId,
    projectId: ProjectId,
  ) => Effect.Effect<ReadonlyArray<ThreadId>, ProjectionRepositoryError>;

  /**
   * Every durable parent/child relation in the store: a child's own
   * t3team.handoff.created parentThreadId, or the parent's t3team.handoff.started
   * childThreadId. Deduped per child with the newest handoff winning. Workflow-
   * owned children never appear (their handoff payload carries workflowRunId
   * instead of a parent). Global (all projects) — used by the server-side
   * child-settle sweep, which must see every project in one scan.
   */
  readonly listParentChildRelations: () => Effect.Effect<
    ReadonlyArray<{ readonly childThreadId: ThreadId; readonly parentThreadId: ThreadId }>,
    ProjectionRepositoryError
  >;

  /**
   * The distinct cross-environment bindings recorded on threads in this store
   * (the t3team start_child `environment` JSON column): every environment this
   * host has ever targeted for a child session, with the newest recorded
   * label, the number of bound threads, and when the newest one was updated.
   * Own-environment threads never carry a binding (same-environment is a
   * no-op), so only OTHER environments appear — the `t3team.thread.children`
   * `environments` op merges its own environment in front of this history.
   *
   * Optional on the SHAPE: the live layer always provides it, but structural
   * fakes in unrelated suites omit it; the children tool wiring degrades to a
   * "not available in this host" error when it is absent.
   */
  readonly listEnvironmentBindings?: () => Effect.Effect<
    ReadonlyArray<{
      readonly environmentId: EnvironmentId;
      readonly label: string | undefined;
      readonly threadCount: number;
      readonly latestThreadAt: string;
    }>,
    ProjectionRepositoryError
  >;

  /**
   * True if the thread currently owns a non-terminal workflow run
   * (queued/running/suspended/sleeping/paused). A paused or clock-parked run is
   * still "running" from the thread's point of view: it can wake and drive work.
   * Used to refuse settling a thread that still has a live workflow orchestration.
   */
  readonly hasNonTerminalWorkflowRun: (
    threadId: ThreadId,
  ) => Effect.Effect<boolean, ProjectionRepositoryError>;

  /**
   * True if the thread has a direct child that is live: the child owns a
   * non-terminal workflow run, or its session is actively running/starting.
   * "Working" and "running a workflow" are the same concept here — one child
   * that is active keeps the parent from settling. Used to refuse settling a
   * parent while one of its sub-threads is still working.
   */
  readonly hasLiveChild: (threadId: ThreadId) => Effect.Effect<boolean, ProjectionRepositoryError>;

  /**
   * True if some parent has a durable, unresolved `t3team.child_wait` on this
   * thread — i.e. a parent deterministically still needs this child's result.
   * A registered `t3team.child_wait.registered` activity with no matching
   * `t3team.child_wait.resolved` for the same waitId. Used to refuse settling a
   * child while a parent has an outstanding wait on it.
   */
  readonly hasPendingParentWait: (
    threadId: ThreadId,
  ) => Effect.Effect<boolean, ProjectionRepositoryError>;

  /**
   * Read the checkpoint context needed to resolve a single thread diff.
   */
  readonly getThreadCheckpointContext: (
    threadId: ThreadId,
  ) => Effect.Effect<Option.Option<ProjectionThreadCheckpointContext>, ProjectionRepositoryError>;

  /**
   * Read only the narrow context needed to compute a full-thread diff from
   * checkpoint 0 to a specific turn count.
   */
  readonly getFullThreadDiffContext: (
    threadId: ThreadId,
    toTurnCount: number,
  ) => Effect.Effect<Option.Option<ProjectionFullThreadDiffContext>, ProjectionRepositoryError>;

  /**
   * Read a single active thread shell row by id.
   */
  readonly getThreadShellById: (
    threadId: ThreadId,
  ) => Effect.Effect<Option.Option<OrchestrationThreadShell>, ProjectionRepositoryError>;

  /** Read the active thread and session facts used to ingest provider events. */
  readonly getThreadRuntimeContext: (
    threadId: ThreadId,
  ) => Effect.Effect<
    Option.Option<
      Pick<OrchestrationThreadShell, "id" | "projectId" | "title" | "titleState" | "session">
    >,
    ProjectionRepositoryError
  >;

  /**
   * Read one requested message and whether another non-compaction user message exists.
   * Newer queued messages count too, preserving first-turn title eligibility.
   */
  readonly getTurnStartMessage: (input: {
    readonly threadId: ThreadId;
    readonly messageId: MessageId;
  }) => Effect.Effect<
    Option.Option<{
      readonly message: OrchestrationMessage;
      readonly hasOtherUserMessages: boolean;
    }>,
    ProjectionRepositoryError
  >;

  /**
   * Read a single active thread detail snapshot by id.
   */
  readonly getThreadDetailById: (
    threadId: ThreadId,
    query?: ProjectionThreadDetailQuery,
  ) => Effect.Effect<Option.Option<OrchestrationThread>, ProjectionRepositoryError>;

  /**
   * Read a single active thread detail together with the projection snapshot
   * sequence in one consistent transaction, so the returned `snapshotSequence`
   * exactly matches the state reflected in `thread` (no interleaving projector
   * update between the two reads).
   *
   * When `window` is provided, the thread's messages, activities, proposed
   * plans, and checkpoints are bounded to a page of recent turns and the
   * response carries `page` metadata (see `OrchestrationThreadDetailWindow`).
   * Without a window the full thread is returned with no `page` field —
   * pagination is strictly opt-in.
   *
   * Activity payloads are projected for clients as they are read in small
   * sequential batches. Callers still apply the full snapshot projector for
   * collection-level activity pruning.
   */
  readonly getThreadDetailSnapshot: (
    threadId: ThreadId,
    window?: OrchestrationThreadDetailWindow,
  ) => Effect.Effect<Option.Option<OrchestrationThreadDetailSnapshot>, ProjectionRepositoryError>;

  /**
   * Cheaply check whether an active (non-deleted) thread row exists.
   *
   * A single-column, single-row probe — use this instead of
   * `getThreadShellById`/`getThreadDetailById` when only existence matters
   * (e.g. asserting a thread is still there before resuming a subscription),
   * since those hydrate the full shell/detail shape across several parallel
   * reads.
   */
  readonly threadExists: (threadId: ThreadId) => Effect.Effect<boolean, ProjectionRepositoryError>;

  /**
   * Cheaply check whether a turn has been requested on an active
   * (non-deleted) thread but has not yet started in the provider.
   *
   * The pending turn-start marker (a `projection_turns` row with
   * `turn_id IS NULL`) is written when a user message is posted
   * (`thread.turn-start-requested`) and removed once the provider starts
   * the turn — or the session settles error/stopped/interrupted. In that
   * requested-but-unstarted window `activeTurnId` is still null, so callers
   * that may stop the thread's provider session must consult this probe
   * first (GHE #343: the reaper disposed a session while a workflow retry
   * turn was queued, and the run failed with "no reply text").
   */
  readonly hasPendingTurnStart: (
    threadId: ThreadId,
  ) => Effect.Effect<boolean, ProjectionRepositoryError>;

  /**
   * List the message refs (id, role, turn) of an active thread in timeline
   * order, without reading or decoding any message body, attachment, or
   * context column.
   *
   * t3team: fork-replayed threads carry `fork:` message ids and are allowed a
   * provider rebind / transcript bootstrap until their first live turn. Turn
   * start must decide that from refs alone — decoding unrelated history on
   * every turn start is exactly what upstream #10108 removed.
   */
  readonly listThreadMessageRefs: (
    threadId: ThreadId,
  ) => Effect.Effect<
    ReadonlyArray<Pick<OrchestrationMessage, "id" | "role" | "turnId">>,
    ProjectionRepositoryError
  >;
}

/**
 * ProjectionSnapshotQuery - Service tag for projection snapshot queries.
 */
export class ProjectionSnapshotQuery extends Context.Service<
  ProjectionSnapshotQuery,
  ProjectionSnapshotQueryShape
>()("t3/orchestration/Services/ProjectionSnapshotQuery") {}
