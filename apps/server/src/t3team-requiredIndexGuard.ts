import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

/**
 * Startup index guard for the hot query paths (GHE #382 follow-up).
 *
 * GHE #382 shipped a fix that only worked if a specific migration id had run:
 * the batched thread-placement lookup relies on the kind index on
 * `projection_thread_activities`, and on machines where that migration id had
 * been consumed by a different migration the index was silently never created
 * and the query degenerated to a full-table scan that froze the event loop.
 *
 * This guard makes that class of bug loud instead of silent: every hot query
 * declares the index it requires here; at boot (after migrations run, in the
 * SQLite layer setup) each declared index is checked against `sqlite_master`
 * and a missing one fails startup with a typed error — not a log line.
 */

export interface RequiredHotQueryIndex {
  /** Index name as SQLite records it in `sqlite_master`. */
  readonly name: string;
  /** What the index keeps fast; surfaced in the startup failure so the fix is obvious. */
  readonly usedBy: string;
}

/**
 * Indexes the hot query paths require to exist for the server to start.
 *
 * The batched placement lookup filters `projection_thread_activities` by
 * `kind` and binds the requested child ids in SQL; without this index that
 * statement is a full-table scan on every call.
 */
export const REQUIRED_HOT_QUERY_INDEXES: readonly RequiredHotQueryIndex[] = [
  {
    name: "idx_projection_thread_activities_kind_created",
    usedBy: "thread placement batch lookup (POST /api/t3team/thread/placements)",
  },
] as const;

export class MissingRequiredIndexError extends Error {
  override readonly name = "MissingRequiredIndexError" as const;
  readonly missingIndexes: readonly string[];

  constructor(missingIndexes: readonly string[]) {
    super(`Required index missing from the database: ${missingIndexes.join(", ")}`);
    this.missingIndexes = missingIndexes;
  }
}

/** Pure decision: which declared indexes are absent from the given set? */
export const findMissingRequiredIndexes = (
  presentIndexes: ReadonlySet<string>,
): readonly RequiredHotQueryIndex[] =>
  REQUIRED_HOT_QUERY_INDEXES.filter((index) => !presentIndexes.has(index.name));

export const readPresentIndexNames = Effect.fn("t3team.requiredIndexGuard.read")(function* () {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql<{ readonly name: string | null }>`
    SELECT name FROM sqlite_master WHERE type = 'index'
  `;
  return rows.map((row) => row.name).filter((name): name is string => name !== null);
});

/**
 * Boot-time assertion: reads `sqlite_master`, and when a declared index is
 * missing logs a structured error and fails with `MissingRequiredIndexError`.
 */
export const assertRequiredIndexesLive = Effect.fn("t3team.requiredIndexGuard.assert")(
  function* () {
    const presentIndexes = new Set(yield* readPresentIndexNames());
    const missing = findMissingRequiredIndexes(presentIndexes);
    if (missing.length === 0) {
      return;
    }
    yield* Effect.logError("Refusing to start: hot-query index missing", {
      missingIndexes: missing.map((index) => index.name),
      usedBy: missing.map((index) => index.usedBy),
    });
    return yield* Effect.fail(
      new MissingRequiredIndexError(missing.map((index) => index.name)),
    );
  },
);
