/**
 * Thread handoff ("Move to" another machine): the thread continues as a successor thread on the
 * target environment, seeded with a budgeted `full_thread_summary` of the source transcript. The
 * source thread is never moved or deleted; it is settled with a `moved_to` fact only after the
 * successor's first run is observed live (capture → launch → verify → settle).
 *
 * WS methods, orchestration:operate scope, capability-gated by `capabilities.t3team.threadHandoff`:
 *  - `t3team.threadHandoff.prepare` — read-only capture on the SOURCE environment;
 *  - `t3team.threadHandoff.record` — records the link fact on either side (source: `moved_to`,
 *    successor: `moved_from`), stored under the thread facts extension key below.
 */
import * as Schema from "effect/Schema";

import {
  EnvironmentId,
  IsoDateTime,
  NonNegativeInt,
  ProjectId,
  RunId,
  ThreadId,
  TrimmedNonEmptyString,
} from "./baseSchemas.ts";
import type { RepositoryIdentity } from "./environment.ts";

/** Thread facts `extensions` key holding a {@link T3TeamThreadHandoffLink}. */
export const T3TEAM_THREAD_HANDOFF_FACT_KEY = "t3team.threadHandoff";

export const T3TeamThreadHandoffPrepareInput = Schema.Struct({
  threadId: ThreadId,
  /** "Move when the turn ends": capture only after the active run settles (bounded wait). */
  waitForTurnEnd: Schema.optionalKey(Schema.Boolean),
});
export type T3TeamThreadHandoffPrepareInput = typeof T3TeamThreadHandoffPrepareInput.Type;

export const T3TeamThreadHandoffRefusalReason = Schema.Literals([
  "unpushed_commits",
  "uncommitted_changes",
  "pending_user_input",
  "live_subagent_children",
  "scheduled_task_bound",
  /** The project has no `origin` remote: another machine cannot get its files. */
  "no_git_remote",
  /** A check could not be read; unknown state never moves. */
  "unverified",
]);
export type T3TeamThreadHandoffRefusalReason = typeof T3TeamThreadHandoffRefusalReason.Type;

/**
 * The `no_git_remote` refusal's sentence. The server refuses with it; a client shows it on the
 * machines it will not offer, so the reason reads the same before and after asking.
 */
export const T3TEAM_THREAD_HANDOFF_NO_GIT_REMOTE_MESSAGE =
  "No `origin` remote: another machine can't get this project's files. Add an origin remote and push, then move.";

/**
 * Whether a project resolved its identity from `origin`, the remote the server's refusal checks.
 * The resolver prefers `origin`, so an identity from any other remote means there is none.
 */
export const t3teamProjectHasOriginRemote = (identity: RepositoryIdentity | null | undefined) =>
  identity?.locator.remoteName === "origin";

export const T3TeamThreadHandoffRefusal = Schema.Struct({
  reason: T3TeamThreadHandoffRefusalReason,
  /** User-facing sentence, e.g. "3 commits on feature/x are not pushed". */
  message: Schema.String,
});
export type T3TeamThreadHandoffRefusal = typeof T3TeamThreadHandoffRefusal.Type;

/** Branch state of the thread's checkout; null fields mean "could not tell". */
export const T3TeamThreadHandoffBranchState = Schema.Struct({
  /**
   * The remote branch the successor starts from (`origin/feature/x`); null when origin does not
   * have it, or the thread has no branch.
   */
  upstream: Schema.NullOr(Schema.String),
  /** Commits on HEAD not on `upstream` (commits no remote has when `upstream` is null). */
  unpushedCommits: Schema.NullOr(NonNegativeInt),
  uncommittedChanges: Schema.NullOr(Schema.Boolean),
});
export type T3TeamThreadHandoffBranchState = typeof T3TeamThreadHandoffBranchState.Type;

/** The continuation envelope's ingredients, captured read-only on the source. */
export const T3TeamThreadHandoffCapture = Schema.Struct({
  threadId: ThreadId,
  projectId: ProjectId,
  title: Schema.String,
  branch: Schema.NullOr(TrimmedNonEmptyString),
  worktreePath: Schema.NullOr(TrimmedNonEmptyString),
  /** The run in flight at capture; the client interrupts it only after the successor is live. */
  activeRunId: Schema.NullOr(RunId),
  /** `full_thread_summary` rendered by the context-handoff engine (budgeted). */
  summaryText: Schema.String,
  branchState: T3TeamThreadHandoffBranchState,
  /** Empty = eligible. Any refusal means nothing may move. */
  refusals: Schema.Array(T3TeamThreadHandoffRefusal),
  capturedAt: IsoDateTime,
});
export type T3TeamThreadHandoffCapture = typeof T3TeamThreadHandoffCapture.Type;

export const T3TeamThreadHandoffDirection = Schema.Literals(["moved_to", "moved_from"]);
export type T3TeamThreadHandoffDirection = typeof T3TeamThreadHandoffDirection.Type;

/** The other side of a handoff: where the thread went (`moved_to`) or came from (`moved_from`). */
export const T3TeamThreadHandoffLink = Schema.Struct({
  direction: T3TeamThreadHandoffDirection,
  peerEnvironmentId: EnvironmentId,
  peerThreadId: ThreadId,
  peerLabel: Schema.String,
  recordedAt: IsoDateTime,
});
export type T3TeamThreadHandoffLink = typeof T3TeamThreadHandoffLink.Type;

export const T3TeamThreadHandoffRecordInput = Schema.Struct({
  threadId: ThreadId,
  direction: T3TeamThreadHandoffDirection,
  peerEnvironmentId: EnvironmentId,
  peerThreadId: ThreadId,
  peerLabel: Schema.String,
});
export type T3TeamThreadHandoffRecordInput = typeof T3TeamThreadHandoffRecordInput.Type;

export const T3TeamThreadHandoffRecordResult = Schema.Struct({ link: T3TeamThreadHandoffLink });
export type T3TeamThreadHandoffRecordResult = typeof T3TeamThreadHandoffRecordResult.Type;

export class T3TeamThreadHandoffError extends Schema.TaggedError<T3TeamThreadHandoffError>()(
  "T3TeamThreadHandoffError",
  { message: Schema.String },
) {}

const decodeThreadHandoffLink = Schema.decodeUnknownOption(T3TeamThreadHandoffLink);

/** The handoff link recorded on a thread's facts, if any (and well-formed). */
export function readThreadHandoffLink(
  facts: { readonly extensions?: { readonly [key: string]: unknown } | undefined } | undefined,
): T3TeamThreadHandoffLink | null {
  const value = facts?.extensions?.[T3TEAM_THREAD_HANDOFF_FACT_KEY];
  if (value === undefined) return null;
  const decoded = decodeThreadHandoffLink(value);
  return decoded._tag === "Some" ? decoded.value : null;
}
