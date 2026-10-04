/**
 * ProviderUsageHoldRepository - Repository interface for provider usage-limit holds.
 *
 * One row per thread whose turn FAILED against an exhausted usage/rate limit
 * of its provider INSTANCE (account). The row carries that turn's user
 * message so the watcher (t3team-providerUsageWatcher.ts) can replay it once
 * after the window resets. Holds never block a send: they only schedule a
 * replay. See migration t3team-055_ProviderUsageHold.ts for the table.
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
  /** Driver kind of the instance, for display only — holds are keyed by instance. */
  provider: ProviderDriverKind,
  /** The provider instance (account) whose limit rejected the turn. Null only on legacy rows. */
  providerInstanceId: Schema.NullOr(ProviderInstanceId),
  /** When the hold started (ISO date-time). */
  since: IsoDateTime,
  /** When the exhausted window resets; null when the provider did not report one. */
  resetsAt: Schema.NullOr(IsoDateTime),
  /** Per-thread auto-resume toggle. Defaults to true for newly created holds. */
  autoResume: Schema.Boolean,
  /** The user message of the failed turn — replayed once on release. */
  pendingTurnMessageId: Schema.NullOr(MessageId),
  /** Set once the hold was released (replayed, answered, or cleared). */
  releasedAt: Schema.NullOr(IsoDateTime),
  releaseReason: Schema.NullOr(Schema.String),
  updatedAt: IsoDateTime,
});
export type ProviderUsageHold = typeof ProviderUsageHold.Type;

export interface ProviderUsageHoldRepositoryShape {
  /**
   * Create or refresh an ACTIVE hold for one thread (upsert by `threadId`).
   *
   * On an already-active row the user-owned `autoResume` toggle and the
   * original `since` are kept; every provider-facing field and the pending
   * turn are refreshed. A released row is re-armed as a fresh hold.
   */
  readonly upsertActiveHold: (
    row: ProviderUsageHold,
  ) => Effect.Effect<void, ProjectionRepositoryError>;

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
   * CLAIM the release of an active hold: a conditional update that returns
   * the released row only to the caller whose update flipped it. None when
   * the row is absent or someone else already released it — so exactly one
   * caller ever replays the pending turn.
   */
  readonly markReleased: (input: {
    readonly threadId: ThreadId;
    readonly reason: string;
    readonly now: IsoDateTime;
  }) => Effect.Effect<Option.Option<ProviderUsageHold>, ProjectionRepositoryError>;

  /**
   * Threads whose current session runs on the given provider instance and is
   * not stopped. Drives the per-instance usage warnings.
   */
  readonly listActiveSessionThreadsForInstance: (input: {
    readonly providerInstanceId: ProviderInstanceId;
  }) => Effect.Effect<ReadonlyArray<{ readonly threadId: string }>, ProjectionRepositoryError>;
}

export class ProviderUsageHoldRepository extends Context.Service<
  ProviderUsageHoldRepository,
  ProviderUsageHoldRepositoryShape
>()("t3/persistence/Services/t3team-ProviderUsageHolds/ProviderUsageHoldRepository") {}
