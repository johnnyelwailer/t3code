/**
 * ProviderUsageHoldRepository - Repository interface for provider usage-limit holds.
 *
 * Owns persistence for the per-thread hold records the provider-usage watcher
 * (t3team-providerUsageWatcher.ts) writes when a provider's rolling plan
 * window is exhausted: which thread is paused, which driver window caused it,
 * when the window resets, the per-thread auto-resume toggle, and the pending
 * turn start the reactor deferred while the hold was active.
 *
 * The table is driver-scoped in effect (limits live at the account level) but
 * thread-keyed: one row per held thread. See migration
 * t3team-055_ProviderUsageHold.ts for the full rationale.
 *
 * @module ProviderUsageHoldRepository
 */
import {
  IsoDateTime,
  MessageId,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import type { ProjectionRepositoryError } from "../Errors.ts";

export const ProviderUsageHold = Schema.Struct({
  threadId: ThreadId,
  /** The driver kind whose account-level window is exhausted (`claudeAgent`, `codex`, …). */
  provider: ProviderDriverKind,
  /** The instance that sampled the exhausted window, when known. */
  providerInstanceId: Schema.NullOr(ProviderInstanceId),
  /** When the hold started (ISO date-time). */
  since: IsoDateTime,
  /** The moment the provider said the window resets; null when it did not report one. */
  resetsAt: Schema.NullOr(IsoDateTime),
  /** Per-thread auto-resume toggle. Defaults to true for newly created holds. */
  autoResume: Schema.Boolean,
  /**
   * The latest user message whose turn start was deferred while the hold was
   * active; null when nothing is pending. Only the newest is stored — earlier
   * pending messages ride along in the full-thread transcript on replay.
   */
  pendingTurnMessageId: Schema.NullOr(MessageId),
  /** Set once the window recovered (or the hold was otherwise cleared). */
  releasedAt: Schema.NullOr(IsoDateTime),
  releaseReason: Schema.NullOr(Schema.String),
  updatedAt: IsoDateTime,
});
export type ProviderUsageHold = typeof ProviderUsageHold.Type;

export interface ProviderUsageHoldRepositoryShape {
  /**
   * Create or refresh an ACTIVE hold for one thread.
   *
   * Upserts by `threadId`. When a row already exists, `autoResume` and
   * `pendingTurnMessageId` are preserved (the toggle is user-owned; the
   * watcher must not reset it) and `since` keeps the original value;
   * `provider` / `providerInstanceId` / `resetsAt` / `updatedAt` are
   * refreshed from the new sample. A released row is re-armed as a fresh
   * hold (`releasedAt` / `releaseReason` cleared).
   */
  readonly upsertActiveHold: (
    row: ProviderUsageHold,
  ) => Effect.Effect<void, ProjectionRepositoryError>;

  /**
   * Point the row's pending turn at `messageId` (latest wins). No-op when the
   * thread has no active hold row.
   */
  readonly setPendingTurn: (input: {
    readonly threadId: ThreadId;
    readonly messageId: MessageId;
    readonly now: IsoDateTime;
  }) => Effect.Effect<Option.Option<ProviderUsageHold>, ProjectionRepositoryError>;

  /** Flip the per-thread auto-resume toggle on an active hold. No-op when absent/released. */
  readonly setAutoResume: (input: {
    readonly threadId: ThreadId;
    readonly autoResume: boolean;
    readonly now: IsoDateTime;
  }) => Effect.Effect<Option.Option<ProviderUsageHold>, ProjectionRepositoryError>;

  /** Read one thread's hold row (active or released) by thread id. */
  readonly getByThreadId: (input: {
    readonly threadId: ThreadId;
  }) => Effect.Effect<Option.Option<ProviderUsageHold>, ProjectionRepositoryError>;

  /** All threads currently held (`released_at IS NULL`). */
  readonly listActive: () => Effect.Effect<
    ReadonlyArray<ProviderUsageHold>,
    ProjectionRepositoryError
  >;

  /**
   * Mark an active hold released. No-op (returns None) when the row is absent
   * or already released.
   */
  readonly markReleased: (input: {
    readonly threadId: ThreadId;
    readonly reason: string;
    readonly now: IsoDateTime;
  }) => Effect.Effect<Option.Option<ProviderUsageHold>, ProjectionRepositoryError>;

  /**
   * Active hold rows for threads whose LAST session ran on a provider instance
   * of the given driver kind. Drives the watcher's act step (which threads to
   * pause when a driver window exhausts). Threads without a session row are
   * covered later by the reactor's turn-start gate, which upserts on defer.
   */
  readonly listActiveSessionThreadsForDriver: (input: {
    readonly provider: ProviderDriverKind;
  }) => Effect.Effect<ReadonlyArray<{ readonly threadId: string }>, ProjectionRepositoryError>;
}

export class ProviderUsageHoldRepository extends Context.Service<
  ProviderUsageHoldRepository,
  ProviderUsageHoldRepositoryShape
>()("t3/persistence/Services/ProviderUsageHolds/ProviderUsageHoldRepository") {}
