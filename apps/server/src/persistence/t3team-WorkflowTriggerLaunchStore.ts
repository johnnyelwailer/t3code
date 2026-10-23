/**
 * The recipe-trigger launch ledger (`workflow_signal_trigger_launches`, migration 116): the durable
 * half of claim → launch. `claim` consumes a key's open inbox slots and records the launch in ONE
 * transaction, so an event is either still in the inbox or owned by a ledger row — never neither.
 * The trigger limits are read back from the same rows (`history`), so they survive a restart.
 * Dumb CRUD, like WorkflowSignalStore: the runner decides, this module persists.
 */
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";

import { toPersistenceSqlError, type ProjectionRepositoryError } from "./Errors.ts";

/** One awaited inbox tuple, consumed up to (and including) the newest slot the caller saw. */
export interface TriggerInboxSlice {
  readonly sourceName: string;
  readonly paramsHash: string;
  readonly signalName: string;
  readonly key: string;
  readonly upToId: number;
}

export interface TriggerLaunchClaim extends TriggerInboxSlice {
  /** Also the run id the launch uses: a retry finding that run already launched it. */
  readonly launchId: string;
  readonly projectId: string;
  readonly recipeId: string;
  readonly triggerId: string;
  readonly args: Record<string, unknown>;
  readonly claimedAt: string;
}

export type TriggerLaunchStatus = "pending" | "launched" | "failed";

export interface TriggerLaunchRow {
  readonly launchId: string;
  readonly projectId: string;
  readonly recipeId: string;
  readonly triggerId: string;
  readonly key: string;
  readonly args: Record<string, unknown>;
  readonly status: TriggerLaunchStatus;
  readonly attempts: number;
  readonly lastError: string | null;
  readonly claimedAt: string;
  readonly launchedAt: string | null;
}

/** What the limits need to know about a recipe's past launches. */
export interface TriggerLaunchHistory {
  /** Claimed-but-unlaunched rows plus launched runs still queued or running (recipe-wide). */
  readonly inFlight: number;
  /** Launches of the recipe claimed at or after `windowStartIso` (gave-up rows excluded). */
  readonly launchesInWindow: number;
  /** The newest claim per key of this trigger since `intervalStartIso`. */
  readonly lastClaimAtByKey: ReadonlyMap<string, string>;
}

export interface WorkflowTriggerLaunchStoreShape {
  /** Consume the slice and record a `pending` launch atomically; false when no slot was open. */
  readonly claim: (input: TriggerLaunchClaim) => Effect.Effect<boolean, ProjectionRepositoryError>;
  /** Consume the slice without a launch (a skipped or faulting event). */
  readonly consume: (
    input: TriggerInboxSlice & { readonly deliveredAt: string },
  ) => Effect.Effect<void, ProjectionRepositoryError>;
  readonly markLaunched: (input: {
    readonly launchId: string;
    readonly launchedAt: string;
  }) => Effect.Effect<void, ProjectionRepositoryError>;
  /** Count a failed attempt; `giveUp` settles the row as `failed`, otherwise it retries at `nextAttemptAt`. */
  readonly markAttemptFailed: (input: {
    readonly launchId: string;
    readonly error: string;
    readonly nextAttemptAt: string;
    readonly giveUp: boolean;
  }) => Effect.Effect<void, ProjectionRepositoryError>;
  /** Pending launches whose retry is due, oldest claim first. */
  readonly listDue: (input: {
    readonly nowIso: string;
    readonly limit: number;
  }) => Effect.Effect<ReadonlyArray<TriggerLaunchRow>, ProjectionRepositoryError>;
  readonly history: (input: {
    readonly recipeId: string;
    readonly triggerId: string;
    readonly windowStartIso: string;
    readonly intervalStartIso: string;
  }) => Effect.Effect<TriggerLaunchHistory, ProjectionRepositoryError>;
  /** The newest launches of one trigger (diagnostics). */
  readonly listRecent: (input: {
    readonly recipeId: string;
    readonly triggerId: string;
    readonly limit: number;
  }) => Effect.Effect<ReadonlyArray<TriggerLaunchRow>, ProjectionRepositoryError>;
  /** GC settled rows claimed before the cutoff; pending rows are never dropped. */
  readonly purgeSettledBefore: (
    cutoffIso: string,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
}

export class WorkflowTriggerLaunchStore extends Context.Service<
  WorkflowTriggerLaunchStore,
  WorkflowTriggerLaunchStoreShape
>()("t3/persistence/t3team-WorkflowTriggerLaunchStore/WorkflowTriggerLaunchStore") {}

interface LaunchDbRow {
  readonly launchId: string;
  readonly projectId: string;
  readonly recipeId: string;
  readonly triggerId: string;
  readonly key: string;
  readonly argsJson: string;
  readonly status: TriggerLaunchStatus;
  readonly attempts: number;
  readonly lastError: string | null;
  readonly claimedAt: string;
  readonly launchedAt: string | null;
}

const ArgsJson = Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown));
const encodeArgs = Schema.encodeSync(ArgsJson);
const decodeArgs = Schema.decodeUnknownOption(ArgsJson);

const toLaunchRow = ({ argsJson, ...row }: LaunchDbRow): TriggerLaunchRow => ({
  ...row,
  args: Option.getOrElse(decodeArgs(argsJson), () => ({})),
});

const makeStore = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const fail = (operation: string) =>
    Effect.mapError(toPersistenceSqlError(`WorkflowTriggerLaunchStore.${operation}:query`));
  const columns = sql`
    launch_id AS "launchId", project_id AS "projectId", recipe_id AS "recipeId",
    trigger_id AS "triggerId", trigger_key AS "key", args_json AS "argsJson", status, attempts,
    last_error AS "lastError", claimed_at AS "claimedAt", launched_at AS "launchedAt"`;
  const consumeSlice = (slice: TriggerInboxSlice, deliveredAt: string) => sql<{ id: number }>`
    UPDATE workflow_signal_inbox SET delivered = 1, delivered_at = ${deliveredAt}
    WHERE source_name = ${slice.sourceName} AND params_hash = ${slice.paramsHash}
      AND signal_name = ${slice.signalName} AND key = ${slice.key}
      AND delivered = 0 AND id <= ${slice.upToId}
    RETURNING id`;

  return {
    claim: (input) =>
      sql
        .withTransaction(
          Effect.gen(function* () {
            const taken = yield* consumeSlice(input, input.claimedAt);
            if (taken.length === 0) return false;
            yield* sql`
              INSERT INTO workflow_signal_trigger_launches (
                launch_id, project_id, recipe_id, trigger_id, trigger_key, source_name,
                params_hash, signal_name, args_json, status, claimed_at, next_attempt_at
              ) VALUES (
                ${input.launchId}, ${input.projectId}, ${input.recipeId}, ${input.triggerId},
                ${input.key}, ${input.sourceName}, ${input.paramsHash}, ${input.signalName},
                ${encodeArgs(input.args)}, 'pending', ${input.claimedAt}, ${input.claimedAt}
              )`;
            return true;
          }),
        )
        .pipe(fail("claim")),
    consume: (input) => consumeSlice(input, input.deliveredAt).pipe(Effect.asVoid, fail("consume")),
    markLaunched: ({ launchId, launchedAt }) =>
      sql`
        UPDATE workflow_signal_trigger_launches
        SET status = 'launched', launched_at = ${launchedAt}, last_error = NULL
        WHERE launch_id = ${launchId}`.pipe(Effect.asVoid, fail("markLaunched")),
    markAttemptFailed: ({ launchId, error, nextAttemptAt, giveUp }) =>
      sql`
        UPDATE workflow_signal_trigger_launches
        SET attempts = attempts + 1, last_error = ${error}, next_attempt_at = ${nextAttemptAt},
            status = ${giveUp ? "failed" : "pending"}
        WHERE launch_id = ${launchId} AND status = 'pending'`.pipe(
        Effect.asVoid,
        fail("markAttemptFailed"),
      ),
    listDue: ({ nowIso, limit }) =>
      sql<LaunchDbRow>`
        SELECT ${columns} FROM workflow_signal_trigger_launches
        WHERE status = 'pending' AND next_attempt_at <= ${nowIso}
        ORDER BY claimed_at ASC LIMIT ${limit}`.pipe(
        Effect.map((rows) => rows.map(toLaunchRow)),
        fail("listDue"),
      ),
    history: ({ recipeId, triggerId, windowStartIso, intervalStartIso }) =>
      Effect.gen(function* () {
        const [inFlight] = yield* sql<{ n: number }>`
          SELECT COUNT(*) AS n FROM workflow_signal_trigger_launches l
          LEFT JOIN workflow_runs r ON r.run_id = l.launch_id
          WHERE l.recipe_id = ${recipeId}
            AND (l.status = 'pending' OR (l.status = 'launched' AND r.status IN ('queued', 'running')))`;
        const [inWindow] = yield* sql<{ n: number }>`
          SELECT COUNT(*) AS n FROM workflow_signal_trigger_launches
          WHERE recipe_id = ${recipeId} AND status != 'failed' AND claimed_at >= ${windowStartIso}`;
        const perKey = yield* sql<{ key: string; at: string }>`
          SELECT trigger_key AS "key", MAX(claimed_at) AS "at" FROM workflow_signal_trigger_launches
          WHERE recipe_id = ${recipeId} AND trigger_id = ${triggerId} AND status != 'failed'
            AND claimed_at >= ${intervalStartIso}
          GROUP BY trigger_key`;
        return {
          inFlight: inFlight?.n ?? 0,
          launchesInWindow: inWindow?.n ?? 0,
          lastClaimAtByKey: new Map(perKey.map((row) => [row.key, row.at])),
        };
      }).pipe(fail("history")),
    listRecent: ({ recipeId, triggerId, limit }) =>
      sql<LaunchDbRow>`
        SELECT ${columns} FROM workflow_signal_trigger_launches
        WHERE recipe_id = ${recipeId} AND trigger_id = ${triggerId}
        ORDER BY claimed_at DESC LIMIT ${limit}`.pipe(
        Effect.map((rows) => rows.map(toLaunchRow)),
        fail("listRecent"),
      ),
    purgeSettledBefore: (cutoffIso) =>
      sql`
        DELETE FROM workflow_signal_trigger_launches
        WHERE status != 'pending' AND claimed_at < ${cutoffIso}`.pipe(
        Effect.asVoid,
        fail("purgeSettledBefore"),
      ),
  } satisfies WorkflowTriggerLaunchStoreShape;
});

export const WorkflowTriggerLaunchStoreLive = Layer.effect(WorkflowTriggerLaunchStore, makeStore);
